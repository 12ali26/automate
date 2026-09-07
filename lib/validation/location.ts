import { z } from 'zod'

import type { LocationType } from '@/lib/domain/types'

/**
 * Location create / edit. `type` is store or housekeeping — the same set the
 * database CHECK constraint enforces. The "at least one active store" and
 * "not referenced by machines" rules are business rules checked in
 * lib/repos/locations.ts, not here.
 */
export const LOCATION_TYPES: readonly LocationType[] = ['store', 'housekeeping']

const name = z
  .string({ error: 'Enter a location name.' })
  .trim()
  .min(1, 'Enter a location name.')
  .max(80, 'That name is too long.')

const type = z.enum(['store', 'housekeeping'], {
  error: 'Choose a location type.',
})

export const locationCreateSchema = z.object({ name, type })

export const locationEditSchema = z.object({
  name,
  type,
  active: z.boolean(),
})

export type LocationCreate = z.infer<typeof locationCreateSchema>
export type LocationEdit = z.infer<typeof locationEditSchema>
