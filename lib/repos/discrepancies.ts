import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Discrepancy, DiscrepancyStatus, OpenDiscrepancyDetail } from '@/lib/domain/types'

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
 * Every open discrepancy with machine, reporter, expected location, and the
 * last person known to have had it, newest first. Feeds the manager
 * dashboard's "reported missing" section. Worded as a fact about the machine —
 * the last holder is context, not an accusation.
 */
export async function listOpenWithDetail(
  tx: Transaction,
): Promise<OpenDiscrepancyDetail[]> {
  const rows = toRows<{
    id: string
    created_at: string | Date
    m_code: string
    m_name: string
    reporter_name: string
    loc_name: string | null
    last_holder_name: string | null
  }>(
    await tx.execute(sql`
      select
        d.id, d.created_at,
        m.code as m_code, m.name as m_name,
        rep.full_name as reporter_name,
        loc.name as loc_name,
        lh.full_name as last_holder_name
      from discrepancies d
      join machines m on m.id = d.machine_id
      join employees rep on rep.id = d.reported_by
      left join locations loc on loc.id = d.expected_location_id
      left join checkouts lc on lc.id = d.last_checkout_id
      left join employees lh on lh.id = lc.employee_id
      where d.status = 'open'
      order by d.created_at desc
    `),
  )
  return rows.map((r) => ({
    id: r.id,
    createdAt: iso(r.created_at),
    machine: { code: r.m_code, name: r.m_name },
    reporter: { fullName: r.reporter_name },
    expectedLocation: r.loc_name ? { name: r.loc_name } : null,
    lastHolder: r.last_holder_name ? { fullName: r.last_holder_name } : null,
  }))
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
