import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Location, LocationType, ManageLocationRow } from '@/lib/domain/types'

import { log as logActivity } from './activity'
import { orgIdParam, toRows } from './_helpers'

type Row = { id: string; name: string; type: LocationType; active: boolean }

const map = (r: Row): Location => ({ id: r.id, name: r.name, type: r.type, active: r.active })

/** Active locations, ordered by name. */
export async function listActive(tx: Transaction): Promise<Location[]> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      select id, name, type, active
      from locations
      where active = true
      order by name asc
    `),
  )
  return rows.map(map)
}

/** An active location looked up by id, or null. Used to validate a chosen
 * return location belongs to this org (RLS) and is still selectable. */
export async function findActiveById(
  tx: Transaction,
  id: string,
): Promise<Location | null> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      select id, name, type, active
      from locations
      where id = ${id} and active = true
      limit 1
    `),
  )
  return rows[0] ? map(rows[0]) : null
}

// -------------------------------------------------------------------------
// Manager admin (Stage 7B)
// -------------------------------------------------------------------------

/**
 * Every location — active and inactive — with the count of machines whose
 * current location is this one. That count is what blocks a hard delete;
 * inactive locations stay listed so history remains legible.
 */
export async function listForManage(tx: Transaction): Promise<ManageLocationRow[]> {
  const rows = toRows<Row & { machine_count: number }>(
    await tx.execute(sql`
      select
        l.id, l.name, l.type, l.active,
        (select count(*)::int from machines m where m.current_location_id = l.id)
          as machine_count
      from locations l
      order by l.active desc, l.name asc
    `),
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    active: r.active,
    machineCount: r.machine_count,
  }))
}

/** A location by id, active or not, or null. */
export async function findById(tx: Transaction, id: string): Promise<Location | null> {
  const rows = toRows<Row>(
    await tx.execute(sql`select id, name, type, active from locations where id = ${id} limit 1`),
  )
  return rows[0] ? map(rows[0]) : null
}

/** How many active 'store' locations the org has. An org must keep at least
 * one — the last one cannot be deleted or deactivated. */
export async function countActiveStores(tx: Transaction): Promise<number> {
  const rows = toRows<{ n: number }>(
    await tx.execute(
      sql`select count(*)::int as n from locations where type = 'store' and active = true`,
    ),
  )
  return rows[0]?.n ?? 0
}

export type CreateLocationResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'duplicate-name' }

/** Create a location. `org_id` from context. A duplicate name within the org is
 * a handled result. Writes a 'location_created' activity_log entry. */
export async function create(
  tx: Transaction,
  input: { name: string; type: LocationType; actorEmployeeId: string },
): Promise<CreateLocationResult> {
  // Pre-check rather than catch a 23505 — a unique violation would abort the
  // transaction. Low-frequency admin path; the DB constraint is the backstop.
  const taken = toRows(
    await tx.execute(sql`select 1 as x from locations where name = ${input.name} limit 1`),
  ).length > 0
  if (taken) return { ok: false, reason: 'duplicate-name' }

  const rows = toRows<{ id: string }>(
    await tx.execute(sql`
      insert into locations (org_id, name, type)
      values (${orgIdParam}, ${input.name}, ${input.type})
      returning id
    `),
  )
  const id = rows[0]!.id
  await logActivity(tx, {
    employeeId: input.actorEmployeeId,
    action: 'location_created',
    detail: { name: input.name, type: input.type },
  })
  return { ok: true, id }
}

export type UpdateLocationResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'duplicate-name' | 'last-store' }

/**
 * Edit a location's name, type and active flag. Deactivating (or retyping away
 * from 'store') the org's last active store is refused. Writes a
 * 'location_updated' activity_log entry.
 */
export async function update(
  tx: Transaction,
  id: string,
  input: { name: string; type: LocationType; active: boolean; actorEmployeeId: string },
): Promise<UpdateLocationResult> {
  const current = toRows<Row>(
    await tx.execute(
      sql`select id, name, type, active from locations where id = ${id} limit 1 for update`,
    ),
  )[0]
  if (!current) return { ok: false, reason: 'not-found' }

  const wasActiveStore = current.active && current.type === 'store'
  const willBeActiveStore = input.active && input.type === 'store'
  if (wasActiveStore && !willBeActiveStore) {
    const stores = await countActiveStores(tx)
    if (stores <= 1) return { ok: false, reason: 'last-store' }
  }

  const clash = toRows(
    await tx.execute(
      sql`select 1 as x from locations where name = ${input.name} and id <> ${id} limit 1`,
    ),
  ).length > 0
  if (clash) return { ok: false, reason: 'duplicate-name' }

  await tx.execute(sql`
    update locations set name = ${input.name}, type = ${input.type}, active = ${input.active}
    where id = ${id}
  `)

  await logActivity(tx, {
    employeeId: input.actorEmployeeId,
    action: 'location_updated',
    detail: {
      name: input.name,
      type: input.type,
      deactivated: current.active && !input.active,
    },
  })
  return { ok: true }
}

export type DeleteLocationResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'in-use' | 'last-store' }

/**
 * Hard delete a location. Refused when any machine's current location is this
 * one, or when historical checkouts / discrepancies still reference it, or when
 * it is the org's last active store — the caller offers "deactivate instead".
 * Writes a 'location_deleted' activity_log entry.
 */
export async function remove(
  tx: Transaction,
  id: string,
  actorEmployeeId: string,
): Promise<DeleteLocationResult> {
  const current = toRows<Row>(
    await tx.execute(
      sql`select id, name, type, active from locations where id = ${id} limit 1 for update`,
    ),
  )[0]
  if (!current) return { ok: false, reason: 'not-found' }

  if (current.active && current.type === 'store') {
    const stores = await countActiveStores(tx)
    if (stores <= 1) return { ok: false, reason: 'last-store' }
  }

  const refs = toRows<{ n: number }>(
    await tx.execute(sql`
      select (
        (select count(*) from machines where current_location_id = ${id}) +
        (select count(*) from checkouts where return_location_id = ${id}) +
        (select count(*) from discrepancies where expected_location_id = ${id})
      )::int as n
    `),
  )[0]
  if ((refs?.n ?? 0) > 0) return { ok: false, reason: 'in-use' }

  await tx.execute(sql`delete from locations where id = ${id}`)
  await logActivity(tx, {
    employeeId: actorEmployeeId,
    action: 'location_deleted',
    detail: { name: current.name, type: current.type },
  })
  return { ok: true }
}
