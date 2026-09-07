import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Incident, IncidentStatus, OpenIncidentDetail } from '@/lib/domain/types'

import { log as logActivity } from './activity'
import { findById as findEmployeeById } from './employees'
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

export type ClearResult =
  | { ok: true; machineNowAvailable: boolean }
  | { ok: false; reason: 'not-manager' | 'not-found' | 'not-open' }

/**
 * Clear an open incident (manager only). Sets status 'cleared', cleared_by,
 * cleared_at. Returns the machine to 'available' ONLY if nothing else is
 * keeping it out of service — no other open incident, and it isn't currently
 * checked out. Writes a 'fault_cleared' activity_log entry.
 *
 * The manager check lives HERE, not only in the UI: staff must never be able
 * to clear their own faults, or the faulty state means nothing.
 */
export async function clear(
  tx: Transaction,
  incidentId: string,
  managerEmployeeId: string,
): Promise<ClearResult> {
  const actor = await findEmployeeById(tx, managerEmployeeId)
  if (!actor || actor.role !== 'manager') return { ok: false, reason: 'not-manager' }

  const incident = toRows<{ machine_id: string; status: IncidentStatus }>(
    await tx.execute(
      sql`select machine_id, status from incidents where id = ${incidentId} limit 1 for update`,
    ),
  )[0]
  if (!incident) return { ok: false, reason: 'not-found' }
  if (incident.status !== 'open') return { ok: false, reason: 'not-open' }

  await tx.execute(sql`
    update incidents
    set status = 'cleared', cleared_by = ${managerEmployeeId}, cleared_at = now()
    where id = ${incidentId} and status = 'open'
  `)

  // Only lift 'faulty' if nothing else keeps the machine out of service.
  const blockers = toRows<{ other_incidents: number; open_checkouts: number }>(
    await tx.execute(sql`
      select
        (select count(*)::int from incidents
           where machine_id = ${incident.machine_id} and status = 'open') as other_incidents,
        (select count(*)::int from checkouts
           where machine_id = ${incident.machine_id} and closed_at is null) as open_checkouts
    `),
  )[0]
  const machineNowAvailable =
    (blockers?.other_incidents ?? 0) === 0 && (blockers?.open_checkouts ?? 0) === 0
  if (machineNowAvailable) {
    await tx.execute(sql`
      update machines set status = 'available'
      where id = ${incident.machine_id} and status = 'faulty'
    `)
  }

  await logActivity(tx, {
    machineId: incident.machine_id,
    employeeId: managerEmployeeId,
    action: 'fault_cleared',
    detail: { incidentId, machineNowAvailable },
  })

  return { ok: true, machineNowAvailable }
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

/**
 * Every open incident with its machine and the employee who reported it,
 * newest first. Feeds the manager dashboard's "open faults" section.
 */
export async function listOpenWithDetail(
  tx: Transaction,
): Promise<OpenIncidentDetail[]> {
  const rows = toRows<{
    id: string
    description: string
    created_at: string | Date
    m_code: string
    m_name: string
    e_full_name: string
    e_fm_id: string
  }>(
    await tx.execute(sql`
      select
        i.id, i.description, i.created_at,
        m.code as m_code, m.name as m_name,
        e.full_name as e_full_name, e.fm_id as e_fm_id
      from incidents i
      join machines m on m.id = i.machine_id
      join employees e on e.id = i.employee_id
      where i.status = 'open'
      order by i.created_at desc
    `),
  )
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    createdAt: iso(r.created_at),
    machine: { code: r.m_code, name: r.m_name },
    reporter: { fullName: r.e_full_name, fmId: r.e_fm_id },
  }))
}
