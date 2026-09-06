/**
 * Small internal helpers shared by the repository modules. Not exported outside
 * lib/repos.
 */

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
