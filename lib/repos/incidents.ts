import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Incident, IncidentStatus } from '@/lib/domain/types'

import { iso, orgIdParam, toRows } from './_helpers'

type Row = {
  id: string
  machine_id: string
  employee_id: string
  checkout_id: string | null
  description: string
  status: IncidentStatus
  created_at: string | Date
}

/**
 * Raise a new open incident against a machine. `org_id` comes from the
 * transaction context. `checkoutId` links the incident to the checkout it was
 * reported on the way back from. Returns the new incident's id.
 */
export async function insertOpen(
  tx: Transaction,
  input: {
    machineId: string
    employeeId: string
    checkoutId?: string | null
    description: string
  },
): Promise<{ id: string }> {
  const rows = toRows<{ id: string }>(
    await tx.execute(sql`
      insert into incidents (org_id, machine_id, employee_id, checkout_id, description, status)
      values (
        ${orgIdParam},
        ${input.machineId},
        ${input.employeeId},
        ${input.checkoutId ?? null},
        ${input.description},
        'open'
      )
      returning id
    `),
  )
  const r = rows[0]
  if (!r) throw new Error('incidents.insertOpen: insert returned no row')
  return { id: r.id }
}

/** The most recent open incident for a machine, or null. */
export async function findOpenForMachine(
  tx: Transaction,
  machineId: string,
): Promise<Incident | null> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      select id, machine_id, employee_id, checkout_id, description, status, created_at
      from incidents
      where machine_id = ${machineId} and status = 'open'
      order by created_at desc
      limit 1
    `),
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    machineId: r.machine_id,
    employeeId: r.employee_id,
    checkoutId: r.checkout_id,
    description: r.description,
    status: r.status,
    createdAt: iso(r.created_at),
  }
}
