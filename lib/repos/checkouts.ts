import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Checkout, OpenCheckoutDetail } from '@/lib/domain/types'

import { isUniqueViolation, iso, orgIdParam, toRows } from './_helpers'

type Row = {
  id: string
  machine_id: string
  employee_id: string
  opened_at: string | Date
  closed_at: string | Date | null
  return_location_id: string | null
}

const map = (r: Row): Checkout => ({
  id: r.id,
  machineId: r.machine_id,
  employeeId: r.employee_id,
  openedAt: iso(r.opened_at),
  closedAt: r.closed_at ? iso(r.closed_at) : null,
  returnLocationId: r.return_location_id,
})

const select = sql`
  select id, machine_id, employee_id, opened_at, closed_at, return_location_id
  from checkouts
`

/** The open checkout for a machine, or null. At most one exists (DB-enforced). */
export async function findOpenForMachine(
  tx: Transaction,
  machineId: string,
): Promise<Checkout | null> {
  const rows = toRows<Row>(
    await tx.execute(sql`${select} where machine_id = ${machineId} and closed_at is null limit 1`),
  )
  return rows[0] ? map(rows[0]) : null
}

/**
 * Like {@link findOpenForMachine} but takes a FOR UPDATE row lock on the open
 * checkout. Use at check-in so a concurrent check-in of the same machine
 * blocks here instead of both closing the row.
 */
export async function findOpenForMachineForUpdate(
  tx: Transaction,
  machineId: string,
): Promise<Checkout | null> {
  const rows = toRows<Row>(
    await tx.execute(
      sql`${select} where machine_id = ${machineId} and closed_at is null limit 1 for update`,
    ),
  )
  return rows[0] ? map(rows[0]) : null
}

/**
 * Returned by {@link insertOpenCheckout} when the one_open_checkout_per_machine
 * partial unique index rejected the insert — i.e. someone else's checkout for
 * this machine is already open. This is an expected race outcome, not a fault:
 * the caller turns it into a friendly "someone just took this machine" result.
 */
export const CHECKOUT_CONFLICT = Symbol('CHECKOUT_CONFLICT')

/**
 * Open a checkout for a machine. `org_id` comes from the transaction context,
 * never the caller. A 23505 on the partial unique index is caught here and
 * signalled as {@link CHECKOUT_CONFLICT}; every other error propagates. After a
 * conflict the transaction is aborted — the caller must roll back, not carry
 * on.
 */
export async function insertOpenCheckout(
  tx: Transaction,
  input: { machineId: string; employeeId: string },
): Promise<Checkout | typeof CHECKOUT_CONFLICT> {
  try {
    const rows = toRows<Row>(
      await tx.execute(sql`
        insert into checkouts (org_id, machine_id, employee_id)
        values (${orgIdParam}, ${input.machineId}, ${input.employeeId})
        returning id, machine_id, employee_id, opened_at, closed_at, return_location_id
      `),
    )
    const r = rows[0]
    if (!r) throw new Error('insertOpenCheckout: insert returned no row')
    return map(r)
  } catch (e) {
    if (isUniqueViolation(e, 'one_open_checkout_per_machine')) return CHECKOUT_CONFLICT
    throw e
  }
}

/**
 * Close an open checkout: stamp closed_at and record where the machine was
 * returned. Fires the checkout_status_sync trigger, which flips the machine
 * back to 'available'. The `closed_at is null` guard makes a double close a
 * no-op.
 */
export async function closeCheckout(
  tx: Transaction,
  input: { checkoutId: string; returnLocationId: string },
): Promise<void> {
  await tx.execute(sql`
    update checkouts
    set closed_at = now(), return_location_id = ${input.returnLocationId}
    where id = ${input.checkoutId} and closed_at is null
  `)
}

/**
 * The most recently closed checkout for a machine — the last person known to
 * have had it. Used when reporting a discrepancy to link the report to who
 * last returned it. Null if the machine has never been checked out.
 */
export async function findLastClosedForMachine(
  tx: Transaction,
  machineId: string,
): Promise<Checkout | null> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      ${select}
      where machine_id = ${machineId} and closed_at is not null
      order by closed_at desc
      limit 1
    `),
  )
  return rows[0] ? map(rows[0]) : null
}

/**
 * Every open checkout with its machine and holder, oldest first (longest out).
 * Feeds the manager dashboard's "overdue" and "currently out" sections.
 */
export async function listOpenWithDetail(
  tx: Transaction,
): Promise<OpenCheckoutDetail[]> {
  const rows = toRows<{
    checkout_id: string
    opened_at: string | Date
    m_id: string
    m_code: string
    m_name: string
    e_id: string
    e_full_name: string
    e_fm_id: string
  }>(
    await tx.execute(sql`
      select
        c.id as checkout_id, c.opened_at,
        m.id as m_id, m.code as m_code, m.name as m_name,
        e.id as e_id, e.full_name as e_full_name, e.fm_id as e_fm_id
      from checkouts c
      join machines m on m.id = c.machine_id
      join employees e on e.id = c.employee_id
      where c.closed_at is null
      order by c.opened_at asc
    `),
  )
  return rows.map((r) => ({
    checkoutId: r.checkout_id,
    openedAt: iso(r.opened_at),
    machine: { id: r.m_id, code: r.m_code, name: r.m_name },
    holder: { id: r.e_id, fullName: r.e_full_name, fmId: r.e_fm_id },
  }))
}

/** All currently-open checkouts held by an employee, newest first. */
export async function listOpenForEmployee(
  tx: Transaction,
  employeeId: string,
): Promise<Checkout[]> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      ${select}
      where employee_id = ${employeeId} and closed_at is null
      order by opened_at desc
    `),
  )
  return rows.map(map)
}
