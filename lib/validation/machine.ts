import { z } from 'zod'

/**
 * Machine create / edit forms. Shared by the client forms and the server
 * actions, which re-parse the raw values.
 *
 * `code` is the human identifier said out loud (FM-SD-003, VAC-001) — never the
 * URL slug, which is generated. It is uppercased and must be unique within the
 * org; the uniqueness check itself is a database constraint, surfaced by
 * lib/repos/machines.ts.
 */
const code = z
  .string({ error: 'Enter a machine code.' })
  .trim()
  .min(1, 'Enter a machine code.')
  .max(32, 'That code is too long (32 characters max).')
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$|^[A-Z0-9]$/,
        'Use letters, digits and hyphens only, e.g. FM-SD-003.',
      ),
  )

const name = z
  .string({ error: 'Enter a machine name.' })
  .trim()
  .min(1, 'Enter a machine name.')
  .max(120, 'That name is too long.')

// A template is optional; a machine can exist before a checklist is attached.
const templateId = z.union([z.uuid(), z.literal('')]).transform((v) => (v === '' ? null : v))
// A location is optional at create time too (it may not be known yet).
const locationId = z.union([z.uuid(), z.literal('')]).transform((v) => (v === '' ? null : v))

export const machineCreateSchema = z.object({
  code,
  name,
  templateId,
  locationId,
})

export const machineEditSchema = z.object({
  code,
  name,
  templateId,
  locationId,
  active: z.boolean(),
})

export type MachineCreate = z.infer<typeof machineCreateSchema>
export type MachineEdit = z.infer<typeof machineEditSchema>
