import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Discrepancy, DiscrepancyStatus } from '@/lib/domain/types'

import { log as logActivity } from './activity'
import { findById as findEmployeeById } from './employees'
import { iso, orgIdParam, toRows } from './_helpers'

type Row = {
  id: string
  machine_id: string
  reported_by: string
  last_checkout_id: string | null
  expected_location_id: string | null
  status: DiscrepancyStatus
  created_at: string | Date
}

const map = (r: Row): Discrepancy => ({
  id: r.id,
  machineId: r.machine_id,
  reportedBy: r.reported_by,
  lastCheckoutId: r.last_checkout_id,
  expectedLocationId: r.expected_location_id,
  status: r.status,
  createdAt: iso(r.created_at),
})

const select = sql`
  select id, machine_id, reported_by, last_checkout_id, expected_location_id, status, created_at
  from discrepancies
`

/** The most recent open discrepancy for a machine, or null. */
export async function findOpenForMachine(
  tx: Transaction,
  machineId: string,
): Promise<Discrepancy | null> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      ${select}
      where machine_id = ${machineId} and status = 'open'
      order by created_at desc
      limit 1
    `),
  )
  return rows[0] ? map(rows[0]) : null
}

/**
 * Raise a new open discrepancy: a report that a machine is not where it should
 * be. `org_id` comes from the transaction context. Never changes machine
 * status — missing is a flag, not a state.
 */
export async function insertOpen(
  tx: Transaction,
  input: {
    machineId: string
    reportedBy: string
    lastCheckoutId?: string | null
    expectedLocationId?: string | null
  },
): Promise<{ id: string }> {
  const rows = toRows<{ id: string }>(
    await tx.execute(sql`
      insert into discrepancies
        (org_id, machine_id, reported_by, last_checkout_id, expected_location_id, status)
      values (
        ${orgIdParam},
        ${input.machineId},
        ${input.reportedBy},
        ${input.lastCheckoutId ?? null},
        ${input.expectedLocationId ?? null},
        'open'
      )
      returning id
    `),
  )
  const r = rows[0]
  if (!r) throw new Error('discrepancies.insertOpen: insert returned no row')
  return { id: r.id }
}

export type ResolveResult =
  | { ok: true }
  | { ok: false; reason: 'not-manager' | 'not-found' | 'not-open' }

/**
 * Resolve an open discrepancy (manager only). Sets status 'resolved',
 * resolved_by, resolved_at and writes a 'discrepancy_resolved' activity_log
 * entry. Never touches machine status.
 */
export async function resolve(
  tx: Transaction,
  discrepancyId: string,
  managerEmployeeId: string,
): Promise<ResolveResult> {
  const actor = await findEmployeeById(tx, managerEmployeeId)
  if (!actor || actor.role !== 'manager') return { ok: false, reason: 'not-manager' }

  const existing = toRows<{ machine_id: string; status: DiscrepancyStatus }>(
    await tx.execute(
      sql`select machine_id, status from discrepancies where id = ${discrepancyId} limit 1 for update`,
    ),
  )[0]
  if (!existing) return { ok: false, reason: 'not-found' }
  if (existing.status !== 'open') return { ok: false, reason: 'not-open' }

  await tx.execute(sql`
    update discrepancies
    set status = 'resolved', resolved_by = ${managerEmployeeId}, resolved_at = now()
    where id = ${discrepancyId} and status = 'open'
  `)

  await logActivity(tx, {
    machineId: existing.machine_id,
    employeeId: managerEmployeeId,
    action: 'discrepancy_resolved',
    detail: { discrepancyId },
  })

  return { ok: true }
}
