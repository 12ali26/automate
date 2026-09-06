import 'server-only'

import { sql } from 'drizzle-orm'

import { orgs } from '@/db/schema'
import { db } from '@/lib/db'

export async function countOrgs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orgs)

  return row?.count ?? 0
}
