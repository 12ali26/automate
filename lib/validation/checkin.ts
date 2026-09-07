import { z } from 'zod'

/**
 * The check-in submission. A return location is always required. When the
 * "something's wrong with it" toggle is on, a description is required too —
 * that is the only conditional field. Whether the chosen location is a
 * housekeeping one is not validated here: it is permitted, just flagged in the
 * UI. That the location id belongs to this org and is active is checked in
 * lib/machine/checkin.ts.
 */
export const checkinSubmissionSchema = z
  .object({
    returnLocationId: z.uuid('Choose where the machine is being returned.'),
    faultReported: z.boolean(),
    faultDescription: z.string().trim().max(2000, 'That description is too long.').nullish(),
  })
  .refine(
    (v) => !v.faultReported || (v.faultDescription != null && v.faultDescription.length > 0),
    { error: 'Describe what is wrong with the machine.', path: ['faultDescription'] },
  )

export type CheckinSubmission = z.infer<typeof checkinSubmissionSchema>
