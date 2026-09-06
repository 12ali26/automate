import 'server-only'

import { sql } from 'drizzle-orm'

import { orgs } from '@/db/schema'
import { db } from '@/lib/db'

import { toRows } from './_helpers'

export async function countOrgs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orgs)

  return row?.count ?? 0
}

export interface OrgRecord {
  id: string
  slug: string
  name: string
  settings: Record<string, unknown>
}

/**
 * Resolve a URL slug to its org. This is the one lookup that necessarily runs
 * *before* an org context exists — it is what produces the id passed to
 * withOrgContext — so it queries directly. `orgs` has no RLS policy, so there
 * is nothing for a context to scope here anyway.
 */
export async function findBySlug(slug: string): Promise<OrgRecord | null> {
  const rows = toRows<{
    id: string
    slug: string
    name: string
    settings: Record<string, unknown> | null
  }>(
    await db.execute(
      sql`select id, slug, name, settings from orgs where slug = ${slug} limit 1`,
    ),
  )
  const row = rows[0]
  if (!row) return null
  return { id: row.id, slug: row.slug, name: row.name, settings: row.settings ?? {} }
}
