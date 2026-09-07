import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import { generateMachineSlug } from '@/lib/domain/machine-code'
import type {
  FleetMachine,
  MachineDetail,
  MachineHistoryEntry,
  MachineStatus,
  ManageMachineDetail,
  ManageMachineRow,
  PrintLabel,
} from '@/lib/domain/types'

import { log as logActivity } from './activity'
import { iso, orgIdParam, toRows } from './_helpers'

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

/** Active machine counts by status, for the manager dashboard's top row. */
export async function countByStatus(
  tx: Transaction,
): Promise<Record<MachineStatus, number>> {
  const rows = toRows<{ status: MachineStatus; n: number }>(
    await tx.execute(sql`
      select status, count(*)::int as n
      from machines
      where active = true
      group by status
    `),
  )
  const counts: Record<MachineStatus, number> = { available: 0, checked_out: 0, faulty: 0 }
  for (const r of rows) counts[r.status] = r.n
  return counts
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

// -------------------------------------------------------------------------
// Manager admin (Stage 7B)
// -------------------------------------------------------------------------

export interface ManageListFilter {
  status?: MachineStatus
  locationId?: string
  limit: number
  offset: number
}

/**
 * A page of the manager machines list — code, name, current location, status,
 * template, active — filtered by status and/or location, ordered by code.
 * Returns the page plus the unpaged `total` so the screen can show "51–100 of
 * 240" and page controls without a second round trip.
 */
export async function listForManage(
  tx: Transaction,
  filter: ManageListFilter,
): Promise<{ rows: ManageMachineRow[]; total: number }> {
  const statusCond = filter.status ? sql`and m.status = ${filter.status}` : sql``
  const locationCond = filter.locationId
    ? sql`and m.current_location_id = ${filter.locationId}`
    : sql``

  const rows = toRows<{
    id: string
    code: string
    name: string
    status: MachineStatus
    active: boolean
    l_name: string | null
    l_active: boolean | null
    t_name: string | null
    t_active: boolean | null
    total: number
  }>(
    await tx.execute(sql`
      select
        m.id, m.code, m.name, m.status, m.active,
        l.name as l_name, l.active as l_active,
        t.name as t_name, t.active as t_active,
        count(*) over ()::int as total
      from machines m
      left join locations l on l.id = m.current_location_id
      left join checklist_templates t on t.id = m.template_id
      where true ${statusCond} ${locationCond}
      order by m.code asc
      limit ${filter.limit} offset ${filter.offset}
    `),
  )

  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
      active: r.active,
      currentLocation: r.l_name ? { name: r.l_name, active: r.l_active ?? false } : null,
      template: r.t_name ? { name: r.t_name, active: r.t_active ?? false } : null,
    })),
  }
}

/** A machine for the manager edit screen, including whether it is checked out
 * (which blocks deactivation). Null if the id is not in this org's context. */
export async function findForManage(
  tx: Transaction,
  id: string,
): Promise<ManageMachineDetail | null> {
  const rows = toRows<{
    id: string
    slug: string
    code: string
    name: string
    status: MachineStatus
    active: boolean
    template_id: string | null
    current_location_id: string | null
    checked_out: boolean
  }>(
    await tx.execute(sql`
      select
        m.id, m.slug, m.code, m.name, m.status, m.active,
        m.template_id, m.current_location_id,
        exists (
          select 1 from checkouts c where c.machine_id = m.id and c.closed_at is null
        ) as checked_out
      from machines m
      where m.id = ${id}
      limit 1
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
    checkedOut: r.checked_out,
  }
}

export type CreateMachineResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; reason: 'duplicate-code' }

/**
 * Create a machine. The slug is generated here — never supplied by a human —
 * with a collision retry in the 31^10 space (effectively never taken). `org_id`
 * comes from the transaction context. A duplicate `code` within the org is a
 * handled result, not a thrown 23505. Writes a 'machine_created' activity_log
 * entry.
 */
export async function create(
  tx: Transaction,
  input: {
    code: string
    name: string
    templateId: string | null
    locationId: string | null
    actorEmployeeId: string
  },
): Promise<CreateMachineResult> {
  let slug = generateMachineSlug()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = toRows(
      await tx.execute(sql`select 1 as x from machines where slug = ${slug} limit 1`),
    )
    if (taken.length === 0) break
    slug = generateMachineSlug()
  }

  // Pre-check the code rather than catching a 23505: a unique violation aborts
  // the surrounding transaction, and this admin path is low-frequency and
  // single-writer. The DB constraint remains the backstop.
  const codeTaken = toRows(
    await tx.execute(sql`select 1 as x from machines where code = ${input.code} limit 1`),
  ).length > 0
  if (codeTaken) return { ok: false, reason: 'duplicate-code' }

  const rows = toRows<{ id: string }>(
    await tx.execute(sql`
      insert into machines (org_id, slug, code, name, template_id, current_location_id, status)
      values (
        ${orgIdParam}, ${slug}, ${input.code}, ${input.name},
        ${input.templateId}, ${input.locationId}, 'available'
      )
      returning id
    `),
  )
  const id = rows[0]!.id

  await logActivity(tx, {
    machineId: id,
    employeeId: input.actorEmployeeId,
    action: 'machine_created',
    detail: { code: input.code, name: input.name },
  })
  return { ok: true, id, slug }
}

export type UpdateMachineResult =
  | { ok: true; deactivated: boolean }
  | { ok: false; reason: 'not-found' | 'duplicate-code' | 'checked-out' }

/**
 * Edit a machine's code, name, template, location and active flag. Deactivating
 * a machine that is currently checked out is refused — it must be returned
 * first. A duplicate code is a handled result. Writes a 'machine_updated'
 * activity_log entry (and notes deactivation in its detail).
 */
export async function update(
  tx: Transaction,
  id: string,
  input: {
    code: string
    name: string
    templateId: string | null
    locationId: string | null
    active: boolean
    actorEmployeeId: string
  },
): Promise<UpdateMachineResult> {
  const current = toRows<{ active: boolean; open_checkout: boolean }>(
    await tx.execute(sql`
      select
        m.active,
        exists (
          select 1 from checkouts c where c.machine_id = m.id and c.closed_at is null
        ) as open_checkout
      from machines m
      where m.id = ${id}
      limit 1
      for update
    `),
  )[0]
  if (!current) return { ok: false, reason: 'not-found' }

  const deactivating = current.active && !input.active
  if (deactivating && current.open_checkout) {
    return { ok: false, reason: 'checked-out' }
  }

  const codeClash = toRows(
    await tx.execute(
      sql`select 1 as x from machines where code = ${input.code} and id <> ${id} limit 1`,
    ),
  ).length > 0
  if (codeClash) return { ok: false, reason: 'duplicate-code' }

  await tx.execute(sql`
    update machines set
      code = ${input.code},
      name = ${input.name},
      template_id = ${input.templateId},
      current_location_id = ${input.locationId},
      active = ${input.active}
    where id = ${id}
  `)

  await logActivity(tx, {
    machineId: id,
    employeeId: input.actorEmployeeId,
    action: 'machine_updated',
    detail: {
      code: input.code,
      name: input.name,
      deactivated: deactivating,
      reactivated: !current.active && input.active,
    },
  })
  return { ok: true, deactivated: deactivating }
}

/**
 * A machine's activity timeline for the detail screen — every checkout episode,
 * fault and missing report, flattened and ordered most-recent-first, paginated.
 * Built from the domain tables (not activity_log) so each entry carries the
 * who / when / where a supervisor asking "what happened to this machine" wants.
 */
export async function historyForManage(
  tx: Transaction,
  machineId: string,
  opts: { limit: number; offset: number },
): Promise<{ entries: MachineHistoryEntry[]; total: number }> {
  const rows = toRows<{
    kind: 'checkout' | 'incident' | 'discrepancy'
    at: string | Date
    closed_at: string | Date | null
    status: string | null
    description: string | null
    person_name: string | null
    person_fm: string | null
    location_name: string | null
    total: number
  }>(
    await tx.execute(sql`
      with timeline as (
        select
          'checkout' as kind, c.opened_at as at, c.closed_at,
          null::text as status, null::text as description,
          e.full_name as person_name, e.fm_id as person_fm,
          rl.name as location_name
        from checkouts c
        join employees e on e.id = c.employee_id
        left join locations rl on rl.id = c.return_location_id
        where c.machine_id = ${machineId}
        union all
        select
          'incident' as kind, i.created_at as at, null::timestamptz as closed_at,
          i.status as status, i.description as description,
          e.full_name as person_name, e.fm_id as person_fm,
          null::text as location_name
        from incidents i
        join employees e on e.id = i.employee_id
        where i.machine_id = ${machineId}
        union all
        select
          'discrepancy' as kind, d.created_at as at, null::timestamptz as closed_at,
          d.status as status, null::text as description,
          e.full_name as person_name, e.fm_id as person_fm,
          el.name as location_name
        from discrepancies d
        join employees e on e.id = d.reported_by
        left join locations el on el.id = d.expected_location_id
        where d.machine_id = ${machineId}
      )
      select *, count(*) over ()::int as total
      from timeline
      order by at desc
      limit ${opts.limit} offset ${opts.offset}
    `),
  )

  return {
    total: rows[0]?.total ?? 0,
    entries: rows.map((r): MachineHistoryEntry => {
      if (r.kind === 'checkout') {
        return {
          kind: 'checkout',
          at: iso(r.at),
          closedAt: r.closed_at ? iso(r.closed_at) : null,
          employee: { fullName: r.person_name ?? '', fmId: r.person_fm ?? '' },
          returnLocation: r.location_name ? { name: r.location_name } : null,
        }
      }
      if (r.kind === 'incident') {
        return {
          kind: 'incident',
          at: iso(r.at),
          status: (r.status as 'open' | 'cleared') ?? 'open',
          description: r.description ?? '',
          reporter: { fullName: r.person_name ?? '', fmId: r.person_fm ?? '' },
        }
      }
      return {
        kind: 'discrepancy',
        at: iso(r.at),
        status: (r.status as 'open' | 'resolved') ?? 'open',
        reporter: { fullName: r.person_name ?? '', fmId: r.person_fm ?? '' },
        expectedLocation: r.location_name ? { name: r.location_name } : null,
      }
    }),
  }
}

/** Machines to print QR labels for: all active, or filtered to one location.
 * Ordered by code. Inactive machines are excluded — their stickers are retired. */
export async function listForPrint(
  tx: Transaction,
  opts: { locationId?: string } = {},
): Promise<PrintLabel[]> {
  const locationCond = opts.locationId
    ? sql`and m.current_location_id = ${opts.locationId}`
    : sql``
  const rows = toRows<{
    id: string
    code: string
    name: string
    slug: string
    current_location_id: string | null
    l_name: string | null
  }>(
    await tx.execute(sql`
      select m.id, m.code, m.name, m.slug, m.current_location_id, l.name as l_name
      from machines m
      left join locations l on l.id = m.current_location_id
      where m.active = true ${locationCond}
      order by m.code asc
    `),
  )
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    slug: r.slug,
    locationId: r.current_location_id,
    locationName: r.l_name,
  }))
}
