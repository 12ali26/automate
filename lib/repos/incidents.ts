import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Incident, IncidentStatus } from '@/lib/domain/types'

import { iso, toRows } from './_helpers'

type Row = {
  id: string
  machine_id: string
  employee_id: string
  checkout_id: string | null
  description: string
  status: IncidentStatus
  created_at: string | Date
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
