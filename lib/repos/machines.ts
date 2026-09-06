import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { FleetMachine, MachineDetail, MachineStatus } from '@/lib/domain/types'

import { iso, toRows } from './_helpers'

type DetailRow = {
  id: string
  code: string
  name: string
  status: MachineStatus
  active: boolean
  template_id: string | null
  current_location_id: string | null
  t_id: string | null
  t_name: string | null
  t_active: boolean | null
  l_id: string | null
  l_name: string | null
  l_type: 'store' | 'housekeeping' | null
  l_active: boolean | null
}

function mapDetail(r: DetailRow): MachineDetail {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    active: r.active,
    templateId: r.template_id,
    currentLocationId: r.current_location_id,
    template: r.t_id
      ? { id: r.t_id, name: r.t_name ?? '', active: r.t_active ?? false }
      : null,
    currentLocation: r.l_id
      ? { id: r.l_id, name: r.l_name ?? '', type: r.l_type ?? 'store', active: r.l_active ?? false }
      : null,
  }
}

const detailSelect = sql`
  select
    m.id, m.code, m.name, m.status, m.active,
    m.template_id, m.current_location_id,
    t.id as t_id, t.name as t_name, t.active as t_active,
    l.id as l_id, l.name as l_name, l.type as l_type, l.active as l_active
  from machines m
  left join checklist_templates t on t.id = m.template_id
  left join locations l on l.id = m.current_location_id
`

/** A machine looked up by its per-org code, with template and location. */
export async function findByCode(
  tx: Transaction,
  code: string,
): Promise<MachineDetail | null> {
  const rows = toRows<DetailRow>(
    await tx.execute(sql`${detailSelect} where m.code = ${code} limit 1`),
  )
  return rows[0] ? mapDetail(rows[0]) : null
}

/** A machine looked up by id, with template and location. */
export async function findById(
  tx: Transaction,
  id: string,
): Promise<MachineDetail | null> {
  const rows = toRows<DetailRow>(
    await tx.execute(sql`${detailSelect} where m.id = ${id} limit 1`),
  )
  return rows[0] ? mapDetail(rows[0]) : null
}

type FleetRow = {
  id: string
  code: string
  name: string
  status: MachineStatus
  l_id: string | null
  l_name: string | null
  l_type: 'store' | 'housekeeping' | null
  l_active: boolean | null
  e_id: string | null
  e_full_name: string | null
  e_fm_id: string | null
  co_opened_at: string | Date | null
  inc_id: string | null
  inc_description: string | null
  inc_created_at: string | Date | null
}

/**
 * Every active machine with its current location, current holder (when checked
 * out) and open incident (when faulty). Single query — no N+1. The partial
 * unique index guarantees at most one open checkout per machine.
 */
export async function listForFleet(tx: Transaction): Promise<FleetMachine[]> {
  const rows = toRows<FleetRow>(
    await tx.execute(sql`
      select
        m.id, m.code, m.name, m.status,
        l.id as l_id, l.name as l_name, l.type as l_type, l.active as l_active,
        e.id as e_id, e.full_name as e_full_name, e.fm_id as e_fm_id,
        co.opened_at as co_opened_at,
        inc.id as inc_id, inc.description as inc_description, inc.created_at as inc_created_at
      from machines m
      left join locations l on l.id = m.current_location_id
      left join lateral (
        select c.employee_id, c.opened_at
        from checkouts c
        where c.machine_id = m.id and c.closed_at is null
        order by c.opened_at desc
        limit 1
      ) co on true
      left join employees e on e.id = co.employee_id
      left join lateral (
        select i.id, i.description, i.created_at
        from incidents i
        where i.machine_id = m.id and i.status = 'open'
        order by i.created_at desc
        limit 1
      ) inc on true
      where m.active = true
      order by m.code
    `),
  )

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    currentLocation: r.l_id
      ? { id: r.l_id, name: r.l_name ?? '', type: r.l_type ?? 'store', active: r.l_active ?? false }
      : null,
    holder:
      r.status === 'checked_out' && r.e_id && r.co_opened_at
        ? {
            employeeId: r.e_id,
            fullName: r.e_full_name ?? '',
            fmId: r.e_fm_id ?? '',
            since: iso(r.co_opened_at),
          }
        : null,
    openIncident:
      r.status === 'faulty' && r.inc_id && r.inc_created_at
        ? { id: r.inc_id, description: r.inc_description ?? '', createdAt: iso(r.inc_created_at) }
        : null,
  }))
}
