/**
 * Small internal helpers shared by the repository modules. Not exported outside
 * lib/repos.
 */

import { sql } from 'drizzle-orm'

/**
 * The acting org id, read transaction-locally from `app.current_org`. Used in
 * INSERT column lists so a row can only ever be attributed to the tenant whose
 * context the transaction carries — never to a value the caller supplied.
 *
 * `nullif(..., '')` is required on Supabase: the supautils extension
 * pre-registers the `app.*` GUC namespace, so an unset setting reads as '' and
 * `''::uuid` would raise. See db/migrations/0002_rls_and_triggers.sql.
 */
export const orgIdParam = sql`nullif(current_setting('app.current_org', true), '')::uuid`

/**
 * True when `err` is a Postgres unique-violation (SQLSTATE 23505). Pass
 * `constraint` to require it be that specific constraint/index. The driver
 * (`postgres`) attaches `code` and `constraint_name` straight from the wire
 * protocol; a wrapper may instead carry the original on `cause`.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as
    | { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } }
    | null
    | undefined
  const code = e?.code ?? e?.cause?.code
  if (code !== '23505') return false
  if (!constraint) return true
  const name = e?.constraint_name ?? e?.cause?.constraint_name
  // Some drivers omit the constraint name; treat "23505 with no name" as a match
  // rather than swallowing a real conflict.
  return name === undefined || name === constraint
}

/** Normalise a `tx.execute()` result to a plain array of row objects. */
export function toRows<T = Record<string, unknown>>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const maybe = (res as { rows?: unknown[] }).rows
  return (Array.isArray(maybe) ? maybe : []) as T[]
}

/** Coerce a driver timestamp (Date or string) to an ISO 8601 string. */
export function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString()
}
