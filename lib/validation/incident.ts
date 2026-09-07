import { z } from 'zod'

/**
 * The fault report. One required free-text field — no categories, no severity
 * picker. Free text is what people actually use, and a supervisor reads it
 * anyway. The server re-parses the raw client value; it never trusts the
 * client's own check.
 */
export const incidentSubmissionSchema = z.object({
  description: z
    .string({ error: 'Describe what is wrong with it.' })
    .trim()
    .min(1, 'Describe what is wrong with it.')
    .max(2000, 'That description is too long.'),
})

export type IncidentSubmission = z.infer<typeof incidentSubmissionSchema>
