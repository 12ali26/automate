import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import { generateMachineSlug } from '@/lib/domain/machine-code'
import type { FleetMachine, MachineDetail, MachineStatus } from '@/lib/domain/types'

import { log as logActivity } from './activity'
import { iso, toRows } from './_helpers'

/**
 * A machine row locked FOR UPDATE by its per-org slug. This is the row lock
 * that serialises concurrent checkouts of the same machine: while one
 * transaction holds it, another blocks here until the first commits or rolls
 * back. No joins — locking a single table keeps the lock semantics simple.
 */
export type LockedMachine = {
  id: string
  slug: string
  code: string
  name: string
  status: MachineStatus
  active: boolean
  templateId: string | null
  currentLocationId: string | null
}

export async function lockBySlug(
  tx: Transaction,
  slug: string,
): Promise<LockedMachine | null> {
  const rows = toRows<{
    id: string
    slug: string
    code: string
    name: string
    status: MachineStatus
    active: boolean
    template_id: string | null
    current_location_id: string | null
  }>(
    await tx.execute(sql`
      select id, slug, code, name, status, active, template_id, current_location_id
      from machines
      where slug = ${slug}
      limit 1
      for update
    `),
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    slug: r.slug,
    code: r.code,
    name: r.name,
    status: r.status,
    active: r.active,
    templateId: r.template_id,
    currentLocationId: r.current_location_id,
  }
}

/**
 * Issue a fresh random slug for a machine (a damaged or compromised sticker).
 * The old URL 404s immediately — that is the point. Writes a 'slug_regenerated'
 * activity_log entry. Retries on the vanishingly rare slug collision. Returns
 * the new slug, or null if the machine id is not in this org's context.
 */
export async function regenerateSlug(
  tx: Transaction,
  machineId: string,
): Promise<string | null> {
  // Pre-check for a free slug rather than catching a 23505 — a unique-violation
  // aborts the surrounding transaction, and a collision in a 31^10 space is
  // effectively impossible anyway. The check is scoped to this org by RLS.
  let slug = generateMachineSlug()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = toRows(
      await tx.execute(sql`select 1 as x from machines where slug = ${slug} limit 1`),
    )
    if (taken.length === 0) break
    slug = generateMachineSlug()
  }

  const rows = toRows<{ slug: string; old_slug: string }>(
    await tx.execute(sql`
      update machines m
      set slug = ${slug}
      from (select slug from machines where id = ${machineId}) prev
      where m.id = ${machineId}
      returning m.slug, prev.slug as old_slug
    `),
  )
  const r = rows[0]
  if (!r) return null

  await logActivity(tx, {
    machineId,
    action: 'slug_regenerated',
    detail: { oldSlug: r.old_slug, newSlug: r.slug },
  })
  return r.slug
}

/** Set a machine's last-known location. Does not touch status. */
export async function setCurrentLocation(
  tx: Transaction,
  input: { machineId: string; locationId: string },
): Promise<void> {
  await tx.execute(sql`
    update machines set current_location_id = ${input.locationId}
    where id = ${input.machineId}
  `)
}

/**
 * Force a machine's status. The checkout_status_sync trigger keeps
 * available/checked_out in step with checkouts on its own — call this ONLY for
 * the one case the trigger cannot know about: a fault reported at check-in,
 * which must override the 'available' the trigger just set.
 */
export async function setStatus(
  tx: Transaction,
  input: { machineId: string; status: MachineStatus },
): Promise<void> {
  await tx.execute(sql`
    update machines set status = ${input.status} where id = ${input.machineId}
  `)
}

/** The machine's current status, or null if it no longer exists. */
export async function getStatus(
  tx: Transaction,
  machineId: string,
): Promise<MachineStatus | null> {
  const rows = toRows<{ status: MachineStatus }>(
    await tx.execute(sql`select status from machines where id = ${machineId} limit 1`),
  )
  return rows[0]?.status ?? null
}

type DetailRow = {
  id: string
  slug: string
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
    slug: r.slug,
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
    m.id, m.slug, m.code, m.name, m.status, m.active,
    m.template_id, m.current_location_id,
    t.id as t_id, t.name as t_name, t.active as t_active,
    l.id as l_id, l.name as l_name, l.type as l_type, l.active as l_active
  from machines m
  left join checklist_templates t on t.id = m.template_id
  left join locations l on l.id = m.current_location_id
`

/**
 * A machine looked up by its per-org URL slug, with template and location.
 * An unknown slug returns null — the page 404s without revealing whether it
 * exists in another org.
 */
export async function findBySlug(
  tx: Transaction,
  slug: string,
): Promise<MachineDetail | null> {
  const rows = toRows<DetailRow>(
    await tx.execute(sql`${detailSelect} where m.slug = ${slug} limit 1`),
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
  slug: string
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
  disc_id: string | null
  disc_created_at: string | Date | null
}

/**
 * Every active machine with its current location, holder (any open checkout),
 * open incident and open discrepancy. Single query — no N+1.
 *
 * holder / openIncident are populated whenever the row exists, NOT gated on
 * `status`: a machine can be both held and faulty (a fault reported while it
 * was checked out), and the fleet view needs to show both facts.
 */
export async function listForFleet(tx: Transaction): Promise<FleetMachine[]> {
  const rows = toRows<FleetRow>(
    await tx.execute(sql`
      select
        m.id, m.slug, m.code, m.name, m.status,
        l.id as l_id, l.name as l_name, l.type as l_type, l.active as l_active,
        e.id as e_id, e.full_name as e_full_name, e.fm_id as e_fm_id,
        co.opened_at as co_opened_at,
        inc.id as inc_id, inc.description as inc_description, inc.created_at as inc_created_at,
        disc.id as disc_id, disc.created_at as disc_created_at
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
      left join lateral (
        select d.id, d.created_at
        from discrepancies d
        where d.machine_id = m.id and d.status = 'open'
        order by d.created_at desc
        limit 1
      ) disc on true
      where m.active = true
      order by m.code
    `),
  )

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    code: r.code,
    name: r.name,
    status: r.status,
    currentLocation: r.l_id
      ? { id: r.l_id, name: r.l_name ?? '', type: r.l_type ?? 'store', active: r.l_active ?? false }
      : null,
    holder:
      r.e_id && r.co_opened_at
        ? {
            employeeId: r.e_id,
            fullName: r.e_full_name ?? '',
            fmId: r.e_fm_id ?? '',
            since: iso(r.co_opened_at),
          }
        : null,
    openIncident:
      r.inc_id && r.inc_created_at
        ? { id: r.inc_id, description: r.inc_description ?? '', createdAt: iso(r.inc_created_at) }
        : null,
    openDiscrepancy:
      r.disc_id && r.disc_created_at
        ? { id: r.disc_id, createdAt: iso(r.disc_created_at) }
        : null,
  }))
}
