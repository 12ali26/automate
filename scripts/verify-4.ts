import { loadEnvConfig } from '@next/env'

import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { performCheckIn } from '@/lib/machine/checkin'
import { performCheckOut } from '@/lib/machine/checkout'

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
  return rows<{ id: string; status: string; current_location_id: string | null; template_id: string | null }>(
    await db.execute(sql`select id, status, current_location_id, template_id from machines where code = ${code} limit 1`),
  )[0]
}

async function openCheckouts(machineId: string) {
  return rows<{ id: string; employee_id: string; closed_at: string | null; return_location_id: string | null }>(
    await db.execute(sql`select id, employee_id, closed_at, return_location_id from checkouts where machine_id = ${machineId} and closed_at is null`),
  )
}

async function allCheckouts(machineId: string) {
  return rows<{ id: string; employee_id: string; closed_at: string | null; return_location_id: string | null }>(
    await db.execute(sql`select id, employee_id, closed_at, return_location_id from checkouts where machine_id = ${machineId} order by opened_at`),
  )
}

async function responsesFor(checkoutId: string) {
  return rows<{ item_id: string; passed: boolean; note: string | null }>(
    await db.execute(sql`select item_id, passed, note from checklist_responses where checkout_id = ${checkoutId}`),
  )
}

async function latestLog(machineId: string) {
  return rows<{ action: string; detail: Record<string, unknown> }>(
    await db.execute(sql`select action, detail from activity_log where machine_id = ${machineId} order by id desc limit 1`),
  )[0]
}

async function openIncidents(machineId: string) {
  return rows<{ id: string; description: string; status: string }>(
    await db.execute(sql`select id, description, status from incidents where machine_id = ${machineId} and status = 'open'`),
  )
}

/** Return the machine to a clean 'available at the store' state. */
async function resetMachine(machineId: string, storeId: string) {
  await db.execute(sql`delete from incidents where machine_id = ${machineId}`)
  // checklist_responses cascade from checkouts.
  await db.execute(sql`delete from checkouts where machine_id = ${machineId}`)
  await db.execute(
    sql`update machines set status = 'available', current_location_id = ${storeId} where id = ${machineId}`,
  )
}

async function main() {
  const demoOrgId = rows<{ id: string }>(
    await db.execute(sql`select id from orgs where slug = 'demo'`),
  )[0]?.id
  if (!demoOrgId) throw new Error('demo org not found — run pnpm db:seed')

  const maria = rows<{ id: string }>(
    await db.execute(sql`select id from employees where org_id = ${demoOrgId} and fm_id = '1001'`),
  )[0]?.id
  const james = rows<{ id: string }>(
    await db.execute(sql`select id from employees where org_id = ${demoOrgId} and fm_id = '1002'`),
  )[0]?.id
  if (!maria || !james) throw new Error('seed employees 1001/1002 not found — run pnpm db:seed')

  const locs = rows<{ id: string; type: string }>(
    await db.execute(sql`select id, type from locations where org_id = ${demoOrgId} and active = true`),
  )
  const storeId = locs.find((l) => l.type === 'store')?.id
  const housekeepingId = locs.find((l) => l.type === 'housekeeping')?.id
  if (!storeId || !housekeepingId) throw new Error('seed locations not found — run pnpm db:seed')

  const machine = await machineRow(CODE)
  if (!machine?.template_id) throw new Error(`${CODE} not found or has no template — run pnpm db:seed`)

  const items = rows<{ id: string; blocking: boolean; sort_order: number }>(
    await db.execute(
      sql`select id, blocking, sort_order from checklist_items where template_id = ${machine.template_id} order by sort_order`,
    ),
  )
  const blockingItem = items.find((i) => i.blocking)
  const nonBlockingItem = items.find((i) => !i.blocking)
  if (!blockingItem || !nonBlockingItem) {
    throw new Error(`${CODE}'s template needs at least one blocking and one non-blocking item`)
  }

  const allPass = () => items.map((i) => ({ itemId: i.id, passed: true, note: null }))
  const withFail = (failItemId: string) =>
    items.map((i) => ({ itemId: i.id, passed: i.id !== failItemId, note: i.id === failItemId ? 'noted' : null }))

  await resetMachine(machine.id, storeId)

  // ---- 1. Checkout succeeds --------------------------------------------------
  {
    const res = await performCheckOut({
      orgId: demoOrgId,
      employeeId: maria,
      code: CODE,
      responses: allPass(),
    })
    const m = await machineRow(CODE)
    const open = await openCheckouts(machine.id)
    const resp = open[0] ? await responsesFor(open[0].id) : []
    const log = await latestLog(machine.id)
    report(
      '1. checkout succeeds (row + responses + status flip + log)',
      res.ok &&
        open.length === 1 &&
        open[0].employee_id === maria &&
        resp.length === items.length &&
        m.status === 'checked_out' &&
        log?.action === 'checkout',
      `ok=${res.ok}, openCheckouts=${open.length}, responses=${resp.length}/${items.length}, status=${m.status}, log=${log?.action}`,
    )
  }

  // ---- 2. Second checkout fails cleanly with the typed result --------------
  {
    const res = await performCheckOut({
      orgId: demoOrgId,
      employeeId: james,
      code: CODE,
      responses: allPass(),
    })
    report(
      '2a. second checkout returns typed "taken", not a throw',
      res.ok === false && res.reason === 'taken',
      `result=${JSON.stringify(res)}`,
    )

    // 2b. Exercise the 23505 catch specifically: force the machine back to
    //     'available' while the checkout is still open (an inconsistency), so
    //     the status guard passes and the partial unique index is what rejects
    //     the insert. Must come back as the typed result, never a 500.
    await db.execute(sql`update machines set status = 'available' where id = ${machine.id}`)
    let threw = false
    let res2b: unknown
    try {
      res2b = await performCheckOut({
        orgId: demoOrgId,
        employeeId: james,
        code: CODE,
        responses: allPass(),
      })
    } catch {
      threw = true
    }
    await db.execute(sql`update machines set status = 'checked_out' where id = ${machine.id}`)
    report(
      '2b. unique-index conflict (23505) is caught -> typed "taken", not a 500',
      !threw &&
        typeof res2b === 'object' &&
        res2b !== null &&
        (res2b as { ok?: boolean }).ok === false &&
        (res2b as { reason?: string }).reason === 'taken',
      `threw=${threw}, result=${JSON.stringify(res2b)}`,
    )
  }

  // ---- 3. CONCURRENCY: two simultaneous checkouts, 10x --------------------
  {
    let deterministic = true
    const notes: string[] = []
    for (let i = 0; i < 10; i += 1) {
      await resetMachine(machine.id, storeId)
      const [a, b] = await Promise.all([
        performCheckOut({ orgId: demoOrgId, employeeId: maria, code: CODE, responses: allPass() }),
        performCheckOut({ orgId: demoOrgId, employeeId: james, code: CODE, responses: allPass() }),
      ])
      const oks = [a, b].filter((r) => r.ok).length
      const takens = [a, b].filter((r) => !r.ok && r.reason === 'taken').length
      const open = await openCheckouts(machine.id)
      const m = await machineRow(CODE)
      const good =
        oks === 1 && takens === 1 && open.length === 1 && m.status === 'checked_out'
      if (!good) {
        deterministic = false
        notes.push(
          `iter ${i}: ok=${oks} taken=${takens} open=${open.length} status=${m.status} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`,
        )
      }
    }
    report(
      '3. concurrency — exactly one of two simultaneous checkouts wins (x10)',
      deterministic,
      deterministic ? '10/10 iterations: 1 success + 1 typed "taken", 1 open checkout, status checked_out' : notes.join(' | '),
    )
  }

  // ---- 4. Blocking failure prevents checkout, nothing written -------------
  {
    await resetMachine(machine.id, storeId)
    const res = await performCheckOut({
      orgId: demoOrgId,
      employeeId: maria,
      code: CODE,
      responses: withFail(blockingItem.id),
    })
    const open = await openCheckouts(machine.id)
    const all = await allCheckouts(machine.id)
    const m = await machineRow(CODE)
    report(
      '4. blocking-item failure blocks checkout (no rows written)',
      res.ok === false && res.reason === 'blocking' && all.length === 0 && open.length === 0 && m.status === 'available',
      `result=${JSON.stringify(res)}, checkoutRows=${all.length}, status=${m.status}`,
    )
  }

  // ---- 5. Non-blocking failure allows checkout, response recorded --------
  {
    await resetMachine(machine.id, storeId)
    const res = await performCheckOut({
      orgId: demoOrgId,
      employeeId: maria,
      code: CODE,
      responses: withFail(nonBlockingItem.id),
    })
    const open = await openCheckouts(machine.id)
    const resp = open[0] ? await responsesFor(open[0].id) : []
    const failRow = resp.find((r) => r.item_id === nonBlockingItem.id)
    const log = await latestLog(machine.id)
    report(
      '5. non-blocking failure allows checkout; failed response stored + logged',
      res.ok === true &&
        open.length === 1 &&
        failRow?.passed === false &&
        log?.action === 'checkout' &&
        Number(log?.detail?.failedItemCount) === 1,
      `ok=${res.ok}, failedResponse.passed=${failRow?.passed}, log.failedItemCount=${JSON.stringify(log?.detail?.failedItemCount)}`,
    )
  }

  // ---- 6. Check-in closes checkout, sets location, status -> available ----
  {
    // (machine is checked out to maria from check 5)
    const res = await performCheckIn({
      orgId: demoOrgId,
      employeeId: maria,
      code: CODE,
      returnLocationId: storeId,
      faultReported: false,
    })
    const m = await machineRow(CODE)
    const open = await openCheckouts(machine.id)
    const all = await allCheckouts(machine.id)
    const closed = all[all.length - 1]
    report(
      '6. check-in closes the checkout, records return location, status -> available',
      res.ok === true &&
        open.length === 0 &&
        closed?.closed_at != null &&
        closed?.return_location_id === storeId &&
        m.status === 'available' &&
        m.current_location_id === storeId,
      `ok=${res.ok}, open=${open.length}, closedAt=${Boolean(closed?.closed_at)}, returnLoc=${closed?.return_location_id === storeId}, status=${m.status}`,
    )
  }

  // ---- 7. Check-in to a housekeeping location ---------------------------
  {
    await resetMachine(machine.id, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: maria, code: CODE, responses: allPass() })
    const res = await performCheckIn({
      orgId: demoOrgId,
      employeeId: maria,
      code: CODE,
      returnLocationId: housekeepingId,
      faultReported: false,
    })
    const m = await machineRow(CODE)
    report(
      '7. check-in to a housekeeping location sets current_location_id',
      res.ok === true && m.current_location_id === housekeepingId && m.status === 'available',
      `ok=${res.ok}, current_location_id==housekeeping=${m.current_location_id === housekeepingId}, status=${m.status}`,
    )
  }

  // ---- 8. Check-in with a fault: incident + final status 'faulty' -------
  {
    await resetMachine(machine.id, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: maria, code: CODE, responses: allPass() })
    const res = await performCheckIn({
      orgId: demoOrgId,
      employeeId: maria,
      code: CODE,
      returnLocationId: storeId,
      faultReported: true,
      faultDescription: 'Grinding noise from the motor.',
    })
    const m = await machineRow(CODE)
    const incs = await openIncidents(machine.id)
    const open = await openCheckouts(machine.id)
    report(
      '8. check-in with fault: incident created, final status is faulty (not available)',
      res.ok === true &&
        res.faultRaised === true &&
        res.incidentId != null &&
        incs.length === 1 &&
        incs[0].description === 'Grinding noise from the motor.' &&
        m.status === 'faulty' &&
        open.length === 0,
      `ok=${res.ok}, incidents=${incs.length}, status=${m.status}, checkoutClosed=${open.length === 0}`,
    )
  }

  // ---- 9. Check-in on someone else's checkout is rejected --------------
  {
    await resetMachine(machine.id, storeId)
    await performCheckOut({ orgId: demoOrgId, employeeId: maria, code: CODE, responses: allPass() })
    const res = await performCheckIn({
      orgId: demoOrgId,
      employeeId: james, // not the holder
      code: CODE,
      returnLocationId: storeId,
      faultReported: false,
    })
    const m = await machineRow(CODE)
    const open = await openCheckouts(machine.id)
    report(
      "9. check-in on another employee's checkout is rejected",
      res.ok === false && res.reason === 'not-yours' && open.length === 1 && m.status === 'checked_out',
      `result=${JSON.stringify(res)}, open=${open.length}, status=${m.status}`,
    )
  }

  // ---- cleanup, then 10. consistency check ---------------------------
  await resetMachine(machine.id, storeId)

  {
    const a = rows(
      await db.execute(sql`
        select m.id from machines m
        where m.status = 'checked_out'
          and not exists (select 1 from checkouts c where c.machine_id = m.id and c.closed_at is null)
      `),
    )
    const b = rows(
      await db.execute(sql`
        select m.id from machines m
        where m.status <> 'checked_out'
          and exists (select 1 from checkouts c where c.machine_id = m.id and c.closed_at is null)
      `),
    )
    const c = rows(
      await db.execute(sql`
        select machine_id from checkouts where closed_at is null
        group by machine_id having count(*) > 1
      `),
    )
    report(
      '10. consistency-check returns zero rows after all of the above',
      a.length === 0 && b.length === 0 && c.length === 0,
      `a=${a.length}, b=${b.length}, c=${c.length}`,
    )
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
