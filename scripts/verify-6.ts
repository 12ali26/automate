import { loadEnvConfig } from '@next/env'

import { sql } from 'drizzle-orm'

import { withOrgContext } from '@/lib/auth/org-context'
import { db } from '@/lib/db'
import { performCheckIn } from '@/lib/machine/checkin'
import { performCheckOut } from '@/lib/machine/checkout'
import { performReportDiscrepancy } from '@/lib/machine/discrepancy'
import { performReportFault } from '@/lib/machine/incident'
import * as discrepanciesRepo from '@/lib/repos/discrepancies'
import * as incidentsRepo from '@/lib/repos/incidents'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

const rows = <T = Record<string, unknown>>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[]

let failures = 0
const report = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!pass) failures += 1
}

const CODE = 'VAC-001'

// --- raw helpers (BYPASSRLS "postgres" role — sees every row) ---------------

async function machineRow(code: string) {
  return rows<{ id: string; slug: string; status: string; current_location_id: string | null; template_id: string | null }>(
    await db.execute(sql`select id, slug, status, current_location_id, template_id from machines where code = ${code} limit 1`),
  )[0]
}
const openCheckouts = async (mid: string) =>
  rows<{ id: string; employee_id: string }>(
    await db.execute(sql`select id, employee_id from checkouts where machine_id = ${mid} and closed_at is null`),
  )
const openIncidents = async (mid: string) =>
  rows<{ id: string; description: string; checkout_id: string | null; status: string; cleared_by: string | null; cleared_at: string | null }>(
    await db.execute(sql`select id, description, checkout_id, status, cleared_by, cleared_at from incidents where machine_id = ${mid} and status = 'open'`),
  )
const allIncidents = async (mid: string) =>
  rows<{ id: string; status: string; cleared_by: string | null; cleared_at: string | null }>(
    await db.execute(sql`select id, status, cleared_by, cleared_at from incidents where machine_id = ${mid} order by created_at`),
  )
const openDiscrepancies = async (mid: string) =>
  rows<{ id: string; reported_by: string; last_checkout_id: string | null; expected_location_id: string | null; status: string }>(
    await db.execute(sql`select id, reported_by, last_checkout_id, expected_location_id, status from discrepancies where machine_id = ${mid} and status = 'open'`),
  )
const logActions = async (mid: string): Promise<string[]> => {
  const r = rows<{ action: string }>(
    await db.execute(sql`select action from activity_log where machine_id = ${mid} order by id`),
  )
  return r.map((x) => x.action)
}

/** Wipe fault/discrepancy/checkout state and return the machine to available@store. */
async function resetMachine(mid: string, storeId: string) {
  await db.execute(sql`delete from discrepancies where machine_id = ${mid}`)
  await db.execute(sql`delete from incidents where machine_id = ${mid}`)
  await db.execute(sql`delete from checkouts where machine_id = ${mid}`)
  await db.execute(sql`update machines set status = 'available', current_location_id = ${storeId} where id = ${mid}`)
}

async function consistencyCounts() {
  const a = rows(await db.execute(sql`
    select 1 from machines m where m.status = 'checked_out'
      and not exists (select 1 from checkouts c where c.machine_id = m.id and c.closed_at is null)`))
  const b = rows(await db.execute(sql`
    select 1 from machines m where m.status not in ('checked_out','faulty')
      and exists (select 1 from checkouts c where c.machine_id = m.id and c.closed_at is null)`))
  const c = rows(await db.execute(sql`
    select machine_id from checkouts where closed_at is null group by machine_id having count(*) > 1`))
  const d = rows(await db.execute(sql`
    select 1 from machines m where m.status = 'faulty'
      and not exists (select 1 from incidents i where i.machine_id = m.id and i.status = 'open')
      and not exists (select 1 from checkouts c where c.machine_id = m.id and c.closed_at is null)`))
  return { a: a.length, b: b.length, c: c.length, d: d.length }
}

async function main() {
  const demoOrgId = rows<{ id: string }>(
    await db.execute(sql`select id from orgs where slug = 'demo'`),
  )[0]?.id
  if (!demoOrgId) throw new Error('demo org not found — run pnpm db:seed')

  const empByFm = async (fm: string) =>
    rows<{ id: string; role: string }>(
      await db.execute(sql`select id, role from employees where org_id = ${demoOrgId} and fm_id = ${fm}`),
    )[0]
  const maria = await empByFm('1001') //  staff
  const james = await empByFm('1002') //  staff
  const manager = await empByFm('1010') // manager
  if (!maria || !james || !manager || manager.role !== 'manager') {
    throw new Error('seed employees 1001/1002/1010 not as expected — run pnpm db:seed')
  }

  const locs = rows<{ id: string; type: string }>(
    await db.execute(sql`select id, type from locations where org_id = ${demoOrgId} and active = true`),
  )
  const storeId = locs.find((l) => l.type === 'store')?.id
  if (!storeId) throw new Error('seed store location not found — run pnpm db:seed')

  const machine = await machineRow(CODE)
  if (!machine?.template_id) throw new Error(`${CODE} missing or has no template — run pnpm db:seed`)
  const slug = machine.slug
  const mid = machine.id

  const items = rows<{ id: string }>(
    await db.execute(sql`select id from checklist_items where template_id = ${machine.template_id} order by sort_order`),
  )
  const allPass = () => items.map((i) => ({ itemId: i.id, passed: true, note: null }))

  // ---- 1. Report fault on an available machine --------------------------
  {
    await resetMachine(mid, storeId)
    const res = await performReportFault({ orgId: demoOrgId, employeeId: maria.id, slug, description: 'Won’t power on.' })
    const m = await machineRow(CODE)
    const inc = await openIncidents(mid)
    report(
      '1. report fault on available machine -> status faulty, incident open',
      res.ok && m.status === 'faulty' && inc.length === 1 && inc[0].description === 'Won’t power on.' && inc[0].checkout_id === null &&
        (await logActions(mid)).includes('fault_reported'),
      `ok=${res.ok}, status=${m.status}, openIncidents=${inc.length}`,
    )
  }

  // ---- 2. Report fault on a machine I hold -> checkout STILL OPEN ------
  {
    await resetMachine(mid, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: maria.id, slug, responses: allPass() })
    const res = await performReportFault({ orgId: demoOrgId, employeeId: maria.id, slug, description: 'Grinding noise.' })
    const m = await machineRow(CODE)
    const open = await openCheckouts(mid)
    const inc = await openIncidents(mid)
    report(
      '2. report fault on a machine I hold -> faulty, but my checkout stays open',
      res.ok && m.status === 'faulty' && open.length === 1 && open[0].employee_id === maria.id &&
        inc.length === 1 && inc[0].checkout_id === open[0].id,
      `ok=${res.ok}, status=${m.status}, openCheckouts=${open.length}, incident.checkout_id linked=${inc[0]?.checkout_id === open[0]?.id}`,
    )
  }

  // ---- 3. Check-in the faulty-but-held machine -> stays faulty --------
  {
    // continues from state 2: faulty + held by maria
    const res = await performCheckIn({ orgId: demoOrgId, employeeId: maria.id, slug, returnLocationId: storeId, faultReported: false })
    const m = await machineRow(CODE)
    const open = await openCheckouts(mid)
    const inc = await openIncidents(mid)
    report(
      '3. check-in a faulty-but-held machine -> checkout closes, machine stays faulty',
      res.ok && open.length === 0 && m.status === 'faulty' && m.current_location_id === storeId && inc.length === 1,
      `ok=${res.ok}, openCheckouts=${open.length}, status=${m.status} (want faulty), openIncidents=${inc.length}`,
    )
  }

  // ---- 4. Report fault on someone else's checked-out machine -> reject -
  {
    await resetMachine(mid, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: james.id, slug, responses: allPass() })
    const res = await performReportFault({ orgId: demoOrgId, employeeId: maria.id, slug, description: 'nope' })
    const m = await machineRow(CODE)
    report(
      "4. report fault on someone else's checked-out machine -> rejected",
      res.ok === false && res.reason === 'not-yours' && m.status === 'checked_out' && (await openIncidents(mid)).length === 0,
      `result=${JSON.stringify(res)}, status=${m.status}`,
    )
  }

  // ---- 5. Report fault on an already-faulty machine -> reject, no dup -
  {
    await resetMachine(mid, storeId)
    await performReportFault({ orgId: demoOrgId, employeeId: maria.id, slug, description: 'first' })
    const res = await performReportFault({ orgId: demoOrgId, employeeId: james.id, slug, description: 'second' })
    report(
      '5. report fault on an already-faulty machine -> rejected, no duplicate incident',
      res.ok === false && res.reason === 'already-faulty' && (await openIncidents(mid)).length === 1,
      `result=${JSON.stringify(res)}, openIncidents=${(await openIncidents(mid)).length}`,
    )
  }

  // ---- 6. Discrepancy on an available machine -------------------------
  {
    await resetMachine(mid, storeId)
    // give it a prior closed checkout (james) so last_checkout_id is meaningful
    await performCheckOut({ orgId: demoOrgId, employeeId: james.id, slug, responses: allPass() })
    await performCheckIn({ orgId: demoOrgId, employeeId: james.id, slug, returnLocationId: storeId, faultReported: false })
    const jamesCheckoutId = rows<{ id: string }>(
      await db.execute(sql`select id from checkouts where machine_id = ${mid} and employee_id = ${james.id} order by closed_at desc limit 1`),
    )[0].id

    const res = await performReportDiscrepancy({ orgId: demoOrgId, employeeId: maria.id, slug })
    const m = await machineRow(CODE)
    const disc = await openDiscrepancies(mid)
    report(
      '6. discrepancy on an available machine -> row created, last_checkout_id = previous holder, status unchanged',
      res.ok && disc.length === 1 && disc[0].reported_by === maria.id && disc[0].last_checkout_id === jamesCheckoutId &&
        disc[0].expected_location_id === storeId && m.status === 'available' &&
        (await logActions(mid)).includes('discrepancy_reported'),
      `ok=${res.ok}, last_checkout_id matches=${disc[0]?.last_checkout_id === jamesCheckoutId}, status=${m.status}`,
    )
  }

  // ---- 7. Discrepancy on a checked-out machine -> reject -------------
  {
    await resetMachine(mid, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: james.id, slug, responses: allPass() })
    const res = await performReportDiscrepancy({ orgId: demoOrgId, employeeId: maria.id, slug })
    report(
      '7. discrepancy on a checked-out machine -> rejected',
      res.ok === false && res.reason === 'not-available' && (await openDiscrepancies(mid)).length === 0,
      `result=${JSON.stringify(res)}`,
    )
  }

  // ---- 8. Duplicate open discrepancy -> reject ---------------------
  {
    await resetMachine(mid, storeId)
    await performReportDiscrepancy({ orgId: demoOrgId, employeeId: maria.id, slug })
    const res = await performReportDiscrepancy({ orgId: demoOrgId, employeeId: james.id, slug })
    report(
      '8. duplicate open discrepancy -> rejected',
      res.ok === false && res.reason === 'already-reported' && (await openDiscrepancies(mid)).length === 1,
      `result=${JSON.stringify(res)}, openDiscrepancies=${(await openDiscrepancies(mid)).length}`,
    )
  }

  // ---- 9. incidents.clear as STAFF -> reject ---------------------
  let incidentIdForClear = ''
  {
    await resetMachine(mid, storeId)
    const fault = await performReportFault({ orgId: demoOrgId, employeeId: maria.id, slug, description: 'to be cleared' })
    incidentIdForClear = fault.ok ? fault.incidentId : ''
    const res = await withOrgContext(demoOrgId, (tx) => incidentsRepo.clear(tx, incidentIdForClear, maria.id))
    const m = await machineRow(CODE)
    report(
      '9. incidents.clear as a STAFF employee -> rejected',
      res.ok === false && res.reason === 'not-manager' && (await openIncidents(mid)).length === 1 && m.status === 'faulty',
      `result=${JSON.stringify(res)}, status=${m.status}`,
    )
  }

  // ---- 10. incidents.clear as a MANAGER -> cleared, machine available -
  {
    const res = await withOrgContext(demoOrgId, (tx) => incidentsRepo.clear(tx, incidentIdForClear, manager.id))
    const m = await machineRow(CODE)
    const inc = (await allIncidents(mid)).find((i) => i.id === incidentIdForClear)
    report(
      '10. incidents.clear as a MANAGER -> cleared, machine available',
      res.ok && res.machineNowAvailable === true && inc?.status === 'cleared' && inc?.cleared_by === manager.id &&
        inc?.cleared_at != null && m.status === 'available' && (await logActions(mid)).includes('fault_cleared'),
      `result=${JSON.stringify(res)}, incident.status=${inc?.status}, machine.status=${m.status}`,
    )
  }

  // ---- 11. incidents.clear while still checked out -> not available --
  {
    await resetMachine(mid, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: maria.id, slug, responses: allPass() })
    const fault = await performReportFault({ orgId: demoOrgId, employeeId: maria.id, slug, description: 'held + faulty' })
    const incId = fault.ok ? fault.incidentId : ''
    const res = await withOrgContext(demoOrgId, (tx) => incidentsRepo.clear(tx, incId, manager.id))
    const m = await machineRow(CODE)
    const inc = (await allIncidents(mid)).find((i) => i.id === incId)
    report(
      '11. incidents.clear on a still-checked-out machine -> cleared, but machine does NOT go available',
      res.ok && res.machineNowAvailable === false && inc?.status === 'cleared' && m.status === 'faulty' &&
        (await openCheckouts(mid)).length === 1,
      `result=${JSON.stringify(res)}, machine.status=${m.status} (want faulty), openCheckouts=${(await openCheckouts(mid)).length}`,
    )
  }

  // ---- 12. consistency-check, including checked-out + faulty --------
  {
    // (a) faulty + held + OPEN incident  (state from check 11 after re-adding an incident)
    await resetMachine(mid, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: maria.id, slug, responses: allPass() })
    await performReportFault({ orgId: demoOrgId, employeeId: maria.id, slug, description: 'both at once' })
    const withIncident = await consistencyCounts()

    // (b) faulty + held + incident CLEARED  (open checkout is the only explainer)
    const incId = (await openIncidents(mid))[0].id
    await withOrgContext(demoOrgId, (tx) => incidentsRepo.clear(tx, incId, manager.id))
    const clearedButHeld = await consistencyCounts()

    // also leave a resolved discrepancy around from earlier; clean up + final sweep
    await withOrgContext(demoOrgId, async (tx) => {
      const open = await discrepanciesRepo.findOpenForMachine(tx, mid)
      if (open) await discrepanciesRepo.resolve(tx, open.id, manager.id)
    })
    await resetMachine(mid, storeId)
    const finalSweep = await consistencyCounts()

    const zero = (x: { a: number; b: number; c: number; d: number }) => x.a === 0 && x.b === 0 && x.c === 0 && x.d === 0
    report(
      '12. consistency-check passes for faulty+held (open incident AND incident-cleared) and clean',
      zero(withIncident) && zero(clearedButHeld) && zero(finalSweep),
      `faulty+held+incident=${JSON.stringify(withIncident)}, faulty+held+cleared=${JSON.stringify(clearedButHeld)}, final=${JSON.stringify(finalSweep)}`,
    )
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
