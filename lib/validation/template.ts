import { z } from 'zod'

/**
 * Checklist template + item editing. Shared by the client editor and the
 * server action.
 *
 * The item list is sent whole on every save. Each item may carry an `id` (an
 * existing row) or not (a new row). Items previously on the template but absent
 * from the submission are removed — soft-deleted if they have responses, hard
 * deleted otherwise. That reconciliation lives in lib/repos/checklists.ts.
 */
const templateName = z
  .string({ error: 'Enter a template name.' })
  .trim()
  .min(1, 'Enter a template name.')
  .max(120, 'That name is too long.')

export const templateCreateSchema = z.object({ name: templateName })

export const templateItemSchema = z.object({
  // Present for an existing item, omitted (or empty) for a new one.
  id: z.union([z.uuid(), z.literal('')]).optional().transform((v) => (v ? v : null)),
  label: z
    .string({ error: 'Every item needs a label.' })
    .trim()
    .min(1, 'Every item needs a label.')
    .max(200, 'That item label is too long.'),
  blocking: z.boolean(),
})

export const templateSaveSchema = z.object({
  name: templateName,
  active: z.boolean(),
  // Order in the array is the display order — sort_order is derived from it.
  items: z.array(templateItemSchema).max(100, 'That is too many checklist items.'),
})

export type TemplateCreate = z.infer<typeof templateCreateSchema>
export type TemplateItemInput = z.infer<typeof templateItemSchema>
export type TemplateSave = z.infer<typeof templateSaveSchema>
