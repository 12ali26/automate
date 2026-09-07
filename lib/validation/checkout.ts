import { z } from 'zod'

/**
 * The checkout submission. The client sends one response per checklist item;
 * the server re-parses this raw payload and never trusts the client's own
 * validation. Semantic checks that need the database — that the responses
 * actually match the machine's template items, that no blocking item failed —
 * happen in lib/machine/checkout.ts, not here.
 */
export const checkoutResponseSchema = z.object({
  itemId: z.uuid(),
  passed: z.boolean(),
  note: z.string().trim().max(500, 'That note is too long.').nullish(),
})

export const checkoutSubmissionSchema = z.object({
  responses: z.array(checkoutResponseSchema).max(100),
})

export type CheckoutResponseInput = z.infer<typeof checkoutResponseSchema>
export type CheckoutSubmission = z.infer<typeof checkoutSubmissionSchema>
