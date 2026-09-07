import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'

import { orgIdParam } from './_helpers'

export interface ResponseInput {
  itemId: string
  passed: boolean
  note?: string | null
}

/**
 * Store the checklist answers for a checkout. `org_id` comes from the
 * transaction context. One row per item; the (checkout_id, item_id) unique
 * constraint rejects duplicates. Called only from inside the checkout
 * transaction, so a failure here rolls the whole checkout back.
 */
export async function insertMany(
  tx: Transaction,
  checkoutId: string,
  responses: ResponseInput[],
): Promise<void> {
  for (const r of responses) {
    await tx.execute(sql`
      insert into checklist_responses (org_id, checkout_id, item_id, passed, note)
      values (${orgIdParam}, ${checkoutId}, ${r.itemId}, ${r.passed}, ${r.note ?? null})
    `)
  }
}
