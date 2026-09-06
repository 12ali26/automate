import { z } from 'zod'

/**
 * The FM ID a staff member types on the shared handset. Shared by the client
 * form and the server action — the server never trusts the client's copy and
 * re-parses the raw form value.
 *
 * FM IDs are short identifiers (the seed uses "1001"…"1010"). We trim, require
 * something, cap the length, and restrict to digits/letters/hyphen so nothing
 * odd reaches SQL even though queries are parameterised.
 */
export const fmIdSchema = z
  .string({ error: 'Enter your FM ID.' })
  .trim()
  .min(1, 'Enter your FM ID.')
  .max(32, 'That FM ID is too long.')
  .regex(/^[A-Za-z0-9-]+$/, 'FM IDs are digits, letters and hyphens only.')

export type FmId = z.infer<typeof fmIdSchema>
