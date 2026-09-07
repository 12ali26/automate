import { withOrgContext } from '@/lib/auth/org-context'
import { canCheckOut, hasBlockingFailure } from '@/lib/domain/machine-state'
import * as activityRepo from '@/lib/repos/activity'
import * as checklistsRepo from '@/lib/repos/checklists'
import * as responsesRepo from '@/lib/repos/checklist-responses'
import { CHECKOUT_CONFLICT, insertOpenCheckout } from '@/lib/repos/checkouts'
import * as machinesRepo from '@/lib/repos/machines'
import { checkoutSubmissionSchema } from '@/lib/validation/checkout'

/**
 * The checkout core: one withOrgContext transaction, no request or framework
 * concerns. The server action (lib/machine/actions.ts) resolves the org and
 * session from the request and then calls this; the verify script calls it
 * directly. Expected outcomes come back as typed results — the only things that
 * throw are genuine faults.
 */

export type CheckOutFailure =
  | 'not-found' //  machine code unknown here, or machine inactive
  | 'invalid' //     payload did not parse, or responses don't match the template
  | 'taken' //       already checked out (status guard or unique-index race)
  | 'faulty' //      machine is out of service
  | 'blocking' //    a blocking checklist item was failed

export type CheckOutResult =
  | { ok: true; checkoutId: string; failedItemCount: number }
  | { ok: false; reason: CheckOutFailure }

export interface PerformCheckOutInput {
  orgId: string
  employeeId: string
  code: string
  responses: { itemId: string; passed: boolean; note?: string | null }[]
}

/** Sentinel used to abort (and roll back) the transaction with a typed reason. */
class Abort {
  constructor(readonly reason: CheckOutFailure) {}
}

export async function performCheckOut(
  input: PerformCheckOutInput,
): Promise<CheckOutResult> {
  const parsed = checkoutSubmissionSchema.safeParse({ responses: input.responses })
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  const submitted = parsed.data.responses

  try {
    const result = await withOrgContext(input.orgId, async (tx) => {
      // 1. Lock the machine row — serialises against a concurrent checkout.
      const machine = await machinesRepo.lockByCode(tx, input.code)
      if (!machine || !machine.active) throw new Abort('not-found')

      // 2. Status must be 'available'. A checked_out machine reports as 'taken'
      //    so a second attempt gets the "someone has this" result, not a 500.
      if (!canCheckOut(machine)) {
        throw new Abort(machine.status === 'checked_out' ? 'taken' : 'faulty')
      }

      // 3. Blocking checklist item must not have failed. Re-load the template
      //    items under the lock and check the submission covers exactly them.
      const items = machine.templateId
        ? await checklistsRepo.itemsForTemplate(tx, machine.templateId)
        : []
      const itemIds = new Set(items.map((i) => i.id))
      const responses = submitted.filter((r) => itemIds.has(r.itemId))
      if (responses.length !== items.length) throw new Abort('invalid')
      if (hasBlockingFailure(items, responses)) throw new Abort('blocking')

      // 4. Open the checkout. The partial unique index is the real gate; a
      //    conflict here is a normal race, not an error.
      const checkout = await insertOpenCheckout(tx, {
        machineId: machine.id,
        employeeId: input.employeeId,
      })
      if (checkout === CHECKOUT_CONFLICT) throw new Abort('taken')

      // 5. Store every answer (blocking passes, non-blocking failures, notes).
      if (responses.length > 0) {
        await responsesRepo.insertMany(tx, checkout.id, responses)
      }

      // 6. Activity log. A non-blocking failure is recorded here, not acted on.
      const failedItemCount = responses.filter((r) => !r.passed).length
      await activityRepo.log(tx, {
        machineId: machine.id,
        employeeId: input.employeeId,
        action: 'checkout',
        detail: { machineCode: machine.code, failedItemCount },
      })

      // 7. Commit (implicit on return).
      return { checkoutId: checkout.id, failedItemCount }
    })

    return { ok: true, ...result }
  } catch (e) {
    if (e instanceof Abort) return { ok: false, reason: e.reason }
    throw e
  }
}
