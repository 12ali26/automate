import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Location, LocationType } from '@/lib/domain/types'

import { toRows } from './_helpers'

type Row = { id: string; name: string; type: LocationType; active: boolean }

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
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, active: r.active }))
}
