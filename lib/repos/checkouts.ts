import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Checkout } from '@/lib/domain/types'

import { iso, toRows } from './_helpers'

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
