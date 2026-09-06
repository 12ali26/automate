import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'

/**
 * The transaction handle passed to every repository function. Deriving it from
 * `db.transaction` keeps it exact without spelling out Drizzle's generics.
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Runs `fn` inside a single database transaction that carries this org's
 * security context.
 *
 * The connection pool means `SET LOCAL ROLE` / `SET LOCAL` only hold for the
 * length of a transaction, so every tenant-scoped query MUST go through here:
 *
 *   1. drop to the non-superuser `app_authenticated` role (so RLS applies)
 *   2. set `app.current_org` transaction-locally (so the org_isolation policy
 *      resolves to this org)
 *   3. run the caller's work on the transaction handle
 *   4. commit, or roll back if `fn` throws
 *
 * `orgId` is validated as a UUID and passed as a bound parameter — never
 * interpolated into SQL text.
 */
export async function withOrgContext<T>(
  orgId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (typeof orgId !== 'string' || !UUID_RE.test(orgId)) {
    throw new Error(`withOrgContext: orgId is not a well-formed UUID: ${JSON.stringify(orgId)}`)
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_authenticated`)
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`)
    return fn(tx)
  })
}
