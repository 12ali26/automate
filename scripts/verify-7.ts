import { loadEnvConfig } from '@next/env'

import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { createManagerAuthUser, deleteManagerAuthUser } from '@/lib/auth/admin-provisioning'
import { signManagerToken, verifyManagerToken } from '@/lib/auth/manager-session-token'
import { withOrgContext } from '@/lib/auth/org-context'
import { signStaffToken } from '@/lib/auth/session-token'
import { signInWithPassword } from '@/lib/auth/supabase-auth'
import { db } from '@/lib/db'
import { isOverdue, nextBoundaryAfter, overdueDeadline, parseShiftSettings } from '@/lib/domain/shifts'
import { performReportDiscrepancy } from '@/lib/machine/discrepancy'
import { performReportFault } from '@/lib/machine/incident'
import * as discrepanciesRepo from '@/lib/repos/discrepancies'
import * as employeesRepo from '@/lib/repos/employees'
import * as incidentsRepo from '@/lib/repos/incidents'

loadEnvConfig(process.cwd())

const rows = <T = Record<string, unknown>>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[]

let failures = 0
const report = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!pass) failures += 1
}

const MANAGER_EMAIL = 'manager@demo.automate'
const MANAGER_PASSWORD = 'Demo-Manager-2026'

async function machineRow(code: string) {
  return rows<{ id: string; slug: string; status: string; current_location_id: string | null }>(
    await db.execute(sql`select id, slug, status, current_location_id from machines where code = ${code} limit 1`),
  )[0]
}
async function resetMachine(mid: string, storeId: string) {
  await db.execute(sql`delete from discrepancies where machine_id = ${mid}`)
  await db.execute(sql`delete from incidents where machine_id = ${mid}`)
  await db.execute(sql`delete from checkouts where machine_id = ${mid}`)
  await db.execute(sql`update machines set status = 'available', current_location_id = ${storeId} where id = ${mid}`)
}
async function consistencyOk() {
  const q = async (s: ReturnType<typeof sql>) => rows(await db.execute(s)).length
  const a = await q(sql`select 1 from machines m where m.status='checked_out' and not exists (select 1 from checkouts c where c.machine_id=m.id and c.closed_at is null)`)
  const b = await q(sql`select 1 from machines m where m.status not in ('checked_out','faulty') and exists (select 1 from checkouts c where c.machine_id=m.id and c.closed_at is null)`)
  const c = await q(sql`select machine_id from checkouts where closed_at is null group by machine_id having count(*)>1`)
  const d = await q(sql`select 1 from machines m where m.status='faulty' and not exists (select 1 from incidents i where i.machine_id=m.id and i.status='open') and not exists (select 1 from checkouts c where c.machine_id=m.id and c.closed_at is null)`)
  return { a, b, c, d, ok: a + b + c + d === 0 }
}

async function main() {
  const demoOrgId = rows<{ id: string }>(await db.execute(sql`select id from orgs where slug='demo'`))[0]?.id
  if (!demoOrgId) throw new Error('demo org not found — run pnpm db:seed')

  const manager = rows<{ id: string; auth_user_id: string | null; role: string }>(
    await db.execute(sql`select id, auth_user_id, role from employees where org_id=${demoOrgId} and fm_id='1010'`),
  )[0]
  const staff = rows<{ id: string }>(
    await db.execute(sql`select id from employees where org_id=${demoOrgId} and fm_id='1001'`),
  )[0]
  if (!manager?.auth_user_id || manager.role !== 'manager' || !staff) {
    throw new Error('demo manager (1010) not provisioned — run pnpm db:seed')
  }
  const storeId = rows<{ id: string }>(
    await db.execute(sql`select id from locations where org_id=${demoOrgId} and type='store' limit 1`),
  )[0].id

  // ---- 1. Manager login works; wrong password rejected ------------------
  {
    const good = await signInWithPassword(MANAGER_EMAIL, MANAGER_PASSWORD)
    const bad = await signInWithPassword(MANAGER_EMAIL, 'not-the-password')
    report(
      '1. manager login: correct password accepted, wrong password rejected',
      good.ok && good.user.id === manager.auth_user_id &&
        bad.ok === false && bad.reason === 'invalid-credentials',
      `good=${JSON.stringify(good.ok ? { id: good.user.id } : good)}, bad=${JSON.stringify(bad)}`,
    )
  }

  const now = Math.floor(Date.now() / 1000)

  // ---- 2. A staff session token cannot satisfy the manager gate --------
  {
    const staffToken = await signStaffToken(
      { orgId: demoOrgId, employeeId: staff.id, fmId: '1001', fullName: 'Maria Santos', issuedAt: now },
      12,
    )
    const asManager = await verifyManagerToken(staffToken, demoOrgId)
    report(
      "2. a staff_session token fails manager verification (can't reach the dashboard)",
      asManager === null,
      `verifyManagerToken(staffToken) -> ${asManager === null ? 'null' : 'ACCEPTED'}`,
    )
  }

  // ---- 3. A manager session for org A is refused on org B -------------
  {
    const tokenForDemo = await signManagerToken({
      orgId: demoOrgId, employeeId: manager.id, authUserId: manager.auth_user_id,
      email: MANAGER_EMAIL, fullName: 'Robert Adeyemi', issuedAt: now,
    })
    const wrongOrg = await verifyManagerToken(tokenForDemo, randomUUID())

    // DB layer: the linked-employee lookup is RLS-scoped to the acting org.
    let otherOrgId = ''
    let crossOrgEmployee: unknown = 'skipped'
    try {
      otherOrgId = rows<{ id: string }>(
        await db.execute(sql`insert into orgs (slug, name) values (${'verify7-' + randomUUID().slice(0, 8)}, 'Verify 7 Org') returning id`),
      )[0].id
      crossOrgEmployee = await withOrgContext(otherOrgId, (tx) =>
        employeesRepo.findByAuthUserId(tx, manager.auth_user_id!),
      )
    } finally {
      if (otherOrgId) await db.execute(sql`delete from orgs where id = ${otherOrgId}`)
    }

    report(
      "3. a manager token for org A is rejected for org B (token orgId + RLS-scoped lookup)",
      wrongOrg === null && crossOrgEmployee === null,
      `verifyManagerToken(otherOrg) -> ${wrongOrg === null ? 'null' : 'ACCEPTED'}, cross-org employee lookup -> ${crossOrgEmployee === null ? 'null' : JSON.stringify(crossOrgEmployee)}`,
    )
  }

  // ---- 4. Overdue: opened before last boundary vs after --------------
  {
    const settings = parseShiftSettings({
      shift_boundaries: ['06:00', '14:00', '22:00'], grace_minutes: 30, timezone: 'Asia/Qatar',
    })
    // Qatar is UTC+3 year-round. "Now" = 15:00 Qatar (12:00Z); the last boundary
    // that has passed is 14:00 Qatar (11:00Z).
    const nowFixed = new Date('2026-03-10T12:00:00Z')
    // Opened 08:00 Qatar (05:00Z), i.e. BEFORE 14:00: next boundary 14:00 (11:00Z),
    // deadline 11:30Z, now 12:00Z >= 11:30Z -> overdue.
    const openedEarly = new Date('2026-03-10T05:00:00Z')
    // Opened 14:45 Qatar (11:45Z), i.e. AFTER 14:00: next boundary 22:00 (19:00Z),
    // deadline 19:30Z, now 12:00Z < 19:30Z -> not overdue.
    const openedLate = new Date('2026-03-10T11:45:00Z')
    const early = isOverdue({ openedAt: openedEarly }, settings, nowFixed)
    const late = isOverdue({ openedAt: openedLate }, settings, nowFixed)
    report(
      '4. overdue calc: opened before the last boundary is overdue; opened after is not',
      early === true && late === false,
      `earlyOpen(05:00Z) overdue=${early} (want true), lateOpen(11:45Z) overdue=${late} (want false)`,
    )
  }

  // ---- 5. Boundary rolling: 23:00 -> due 06:30 next day -------------
  {
    const settings = parseShiftSettings({
      shift_boundaries: ['06:00', '14:00', '22:00'], grace_minutes: 30, timezone: 'Asia/Qatar',
    })
    // 23:00 Qatar on 2026-03-10 == 20:00Z.
    const opened = new Date('2026-03-10T20:00:00Z')
    const boundary = nextBoundaryAfter(opened, settings.shiftBoundaries, settings.timezone)
    const deadline = overdueDeadline(opened, settings)
    // Expected: 06:00 Qatar next day == 2026-03-11T03:00:00Z ; deadline == 03:30Z.
    const boundaryOk = boundary?.toISOString() === '2026-03-11T03:00:00.000Z'
    const deadlineOk = deadline?.toISOString() === '2026-03-11T03:30:00.000Z'
    report(
      '5. boundary rolls to next day: 23:00 checkout is due 06:30, not 22:30',
      boundaryOk && deadlineOk,
      `nextBoundary=${boundary?.toISOString()} (want 2026-03-11T03:00Z), deadline=${deadline?.toISOString()} (want 2026-03-11T03:30Z)`,
    )
  }

  // ---- 6. Empty shift_boundaries -> nothing overdue, no errors -----
  {
    let threw = false
    let overdueResult: boolean | 'err' = 'err'
    try {
      const settings = parseShiftSettings({ grace_minutes: 30, timezone: 'Asia/Qatar' })
      overdueResult = isOverdue(
        { openedAt: new Date('2020-01-01T00:00:00Z') }, // ancient checkout
        settings,
        new Date(),
      )
    } catch {
      threw = true
    }
    report(
      '6. no shift boundaries -> nothing is ever overdue, no error',
      !threw && overdueResult === false,
      `threw=${threw}, isOverdue(ancient checkout)=${overdueResult}`,
    )
  }

  // ---- 7. Clear fault as the manager -> machine back to available --
  {
    const m = await machineRow('VAC-001')
    await resetMachine(m.id, storeId)
    const fault = await performReportFault({
      orgId: demoOrgId, employeeId: staff.id, slug: m.slug, description: 'stage7 clear test',
    })
    const incidentId = fault.ok ? fault.incidentId : ''
    const res = await withOrgContext(demoOrgId, (tx) => incidentsRepo.clear(tx, incidentId, manager.id))
    const after = await machineRow('VAC-001')
    report(
      '7. manager clears a fault -> incident cleared, machine returns to available',
      res.ok && res.machineNowAvailable === true && after.status === 'available',
      `result=${JSON.stringify(res)}, machine.status=${after.status}`,
    )
    await resetMachine(m.id, storeId)
  }

  // ---- 8. Resolve discrepancy as the manager ---------------------
  {
    const m = await machineRow('VAC-001')
    await resetMachine(m.id, storeId)
    const disc = await performReportDiscrepancy({ orgId: demoOrgId, employeeId: staff.id, slug: m.slug })
    const discId = disc.ok ? disc.discrepancyId : ''
    const res = await withOrgContext(demoOrgId, (tx) => discrepanciesRepo.resolve(tx, discId, manager.id))
    const stillOpen = await withOrgContext(demoOrgId, (tx) => discrepanciesRepo.findOpenForMachine(tx, m.id))
    report(
      '8. manager resolves a discrepancy -> status resolved, no longer open',
      res.ok && stillOpen === null,
      `result=${JSON.stringify(res)}, openForMachine=${stillOpen === null ? 'null' : 'STILL OPEN'}`,
    )
    await resetMachine(m.id, storeId)
  }

  // ---- 9. consistency-check still passes -----------------------
  {
    const c = await consistencyOk()
    report('9. consistency-check passes', c.ok, `a=${c.a} b=${c.b} c=${c.c} d=${c.d}`)
  }

  // ---- 10. seed provisioned the demo manager via the Admin API -----
  {
    // The seed ran createManagerAuthUser; a re-run with the same email must be
    // a HANDLED 'already-exists' (never a throw / 500), resolving the same id.
    let threw = false
    let dup: Awaited<ReturnType<typeof createManagerAuthUser>> | null = null
    try {
      dup = await createManagerAuthUser(MANAGER_EMAIL, MANAGER_PASSWORD)
    } catch {
      threw = true
    }
    report(
      "10. duplicate provisioning is a handled 'already-exists', not a 500",
      !threw &&
        dup !== null &&
        dup.ok === false &&
        dup.reason === 'already-exists' &&
        dup.authUserId === manager.auth_user_id,
      `threw=${threw}, result=${JSON.stringify(dup)}, want authUserId=${manager.auth_user_id}`,
    )
  }

  // ---- 11. delete works; deleted manager can no longer log in ------
  {
    const email = `verify7-del-${randomUUID().slice(0, 8)}@automate-demo.dev`
    const password = 'Verify7-Delete-Aa1!'
    const created = await createManagerAuthUser(email, password)
    const createdId = created.ok ? created.authUserId : ''
    const loginBefore = await signInWithPassword(email, password)
    if (createdId) await deleteManagerAuthUser(createdId)
    const loginAfter = await signInWithPassword(email, password)
    report(
      '11. deleteManagerAuthUser: login works before delete, fails after',
      created.ok &&
        loginBefore.ok === true &&
        loginAfter.ok === false &&
        loginAfter.reason === 'invalid-credentials',
      `created=${created.ok}, loginBefore=${loginBefore.ok}, loginAfter=${JSON.stringify(loginAfter)}`,
    )
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
