import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Location, LocationType } from '@/lib/domain/types'

import { toRows } from './_helpers'

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
