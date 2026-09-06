import { loadEnvConfig } from '@next/env'

import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { decodeJwt } from 'jose'

import { withOrgContext } from '@/lib/auth/org-context'
import {
  DEFAULT_MAX_SESSION_HOURS,
  maxSessionHours,
  signStaffToken,
  verifyStaffToken,
  type StaffSession,
} from '@/lib/auth/session-token'
import { db } from '@/lib/db'
import * as activity from '@/lib/repos/activity'
import * as employees from '@/lib/repos/employees'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

const rows = <T = Record<string, unknown>>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[]

let failures = 0
const report = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!pass) failures += 1
}

class Rollback extends Error {}

async function main() {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not set — add it to .env.local')
  }

  const demoOrgId = rows<{ id: string }>(
    await db.execute(sql`select id from orgs where slug = 'demo'`),
  )[0]?.id
  if (!demoOrgId) throw new Error('demo org not found — run pnpm db:seed')

  // ---- 1. Valid FM ID -> session building blocks --------------------------
  const employee = await withOrgContext(demoOrgId, (tx) => employees.findByFmId(tx, '1001'))
  const hours = maxSessionHours({}) // no override -> default
  const now = Math.floor(Date.now() / 1000)
  let roundTrips = false
  let expiryOk = false
  if (employee) {
    const session: StaffSession = {
      orgId: demoOrgId,
      employeeId: employee.id,
      fmId: employee.fmId,
      fullName: employee.fullName,
      issuedAt: now,
    }
    const token = await signStaffToken(session, hours)
    const decoded = await verifyStaffToken(token, demoOrgId)
    roundTrips =
      decoded !== null &&
      decoded.orgId === session.orgId &&
      decoded.employeeId === session.employeeId &&
      decoded.fmId === session.fmId &&
      decoded.fullName === session.fullName &&
      decoded.issuedAt === session.issuedAt
    expiryOk = decodeJwt(token).exp === now + hours * 3600
  }
  const settingsRespected =
    hours === DEFAULT_MAX_SESSION_HOURS &&
    maxSessionHours({ max_session_hours: 3 }) === 3 &&
    maxSessionHours(null) === DEFAULT_MAX_SESSION_HOURS
  report(
    '1. valid FM ID -> session (active employee, token round-trips, expiry from settings)',
    Boolean(employee) && employee?.active === true && roundTrips && expiryOk && settingsRespected,
    `employee=${employee?.fmId ?? 'none'}, roundTrips=${roundTrips}, exp=+${hours}h, settings 3->${maxSessionHours({ max_session_hours: 3 })}`,
  )

  // ---- 2. Unknown FM ID -> generic rejection ----------------------------
  const unknown = await withOrgContext(demoOrgId, (tx) => employees.findByFmId(tx, '999999'))
  report('2. unknown FM ID rejected', unknown === null, `findByFmId('999999') -> ${unknown === null ? 'null' : 'row'}`)

  // ---- 3. Inactive employee -> same rejection (rolled back) ---------
  const inactive: { hidden?: boolean; peerVisible?: boolean } = {}
  try {
    await withOrgContext(demoOrgId, async (tx) => {
      await tx.execute(sql`update employees set active = false where fm_id = '1001'`)
      const a = await employees.findByFmId(tx, '1001')
      const b = await employees.findByFmId(tx, '1002')
      inactive.hidden = a === null
      inactive.peerVisible = b !== null
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  report(
    '3. inactive employee rejected',
    inactive.hidden === true && inactive.peerVisible === true,
    `inactive hidden=${inactive.hidden}, active peer still found=${inactive.peerVisible}`,
  )

  // ---- 4. Session for org A is not accepted on org B --------------------
  const tokenForDemo = await signStaffToken(
    { orgId: demoOrgId, employeeId: randomUUID(), fmId: '1001', fullName: 'Test', issuedAt: now },
    12,
  )
  const onOtherOrg = await verifyStaffToken(tokenForDemo, randomUUID())
  const onOwnOrg = await verifyStaffToken(tokenForDemo, demoOrgId)
  report(
    '4. cross-org session rejected',
    onOtherOrg === null && onOwnOrg !== null,
    `other org -> ${onOtherOrg === null ? 'null' : 'accepted'}, own org -> ${onOwnOrg ? 'accepted' : 'null'}`,
  )

  // ---- 5. Tampered / expired JWT -> no session -------------------------
  const flipAt = 12
  const tampered = tokenForDemo.slice(0, flipAt) + (tokenForDemo[flipAt] === 'A' ? 'B' : 'A') + tokenForDemo.slice(flipAt + 1)
  const tamperedResult = await verifyStaffToken(tampered, demoOrgId)
  const garbageResult = await verifyStaffToken('not.a.valid.jwt', demoOrgId)
  const expiredToken = await signStaffToken(
    { orgId: demoOrgId, employeeId: randomUUID(), fmId: '1001', fullName: 'Test', issuedAt: now - 100_000 },
    1,
  )
  const expiredResult = await verifyStaffToken(expiredToken, demoOrgId)
  report(
    '5. tampered / expired JWT -> no session',
    tamperedResult === null && garbageResult === null && expiredResult === null,
    `tampered=${tamperedResult === null ? 'null' : 'accepted'}, garbage=${garbageResult === null ? 'null' : 'accepted'}, expired=${expiredResult === null ? 'null' : 'accepted'}`,
  )

  // ---- 6. sign_in and sign_out reach activity_log (rolled back) ------
  const logged: { count?: number; allDemo?: boolean; actions?: string[] } = {}
  try {
    await withOrgContext(demoOrgId, async (tx) => {
      const si = await activity.log(tx, { employeeId: employee?.id ?? null, action: 'sign_in' })
      const so = await activity.log(tx, { employeeId: employee?.id ?? null, action: 'sign_out' })
      const back = rows<{ id: string; org_id: string; action: string }>(
        await tx.execute(
          sql`select id, org_id, action from activity_log where id in (${si.id}::bigint, ${so.id}::bigint) order by id`,
        ),
      )
      logged.count = back.length
      logged.allDemo = back.every((r) => r.org_id === demoOrgId)
      logged.actions = back.map((r) => r.action)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  report(
    '6. sign_in + sign_out written to activity_log with correct org_id',
    logged.count === 2 &&
      logged.allDemo === true &&
      (logged.actions?.includes('sign_in') ?? false) &&
      (logged.actions?.includes('sign_out') ?? false),
    `rows=${logged.count}, actions=[${(logged.actions ?? []).join(', ')}], org_id matches=${logged.allDemo}`,
  )

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
