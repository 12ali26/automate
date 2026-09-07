import { withOrgContext } from '@/lib/auth/org-context'
import * as activityRepo from '@/lib/repos/activity'
import * as checkoutsRepo from '@/lib/repos/checkouts'
import * as incidentsRepo from '@/lib/repos/incidents'
import * as locationsRepo from '@/lib/repos/locations'
import * as machinesRepo from '@/lib/repos/machines'
import { checkinSubmissionSchema } from '@/lib/validation/checkin'

/**
 * The check-in core: one withOrgContext transaction, no request or framework
 * concerns. Mirror of lib/machine/checkout.ts — the server action calls this,
 * so does the verify script.
 */

export type CheckInFailure =
  | 'not-found' //   machine code unknown here, or machine inactive
  | 'invalid' //     payload did not parse, or the return location is not valid
  | 'not-yours' //   no open checkout, or it belongs to someone else

export type CheckInResult =
  | { ok: true; faultRaised: boolean; incidentId: string | null }
  | { ok: false; reason: CheckInFailure }

export interface PerformCheckInInput {
  orgId: string
  employeeId: string
  /** The machine's URL slug (not its human code). */
  slug: string
  returnLocationId: string
  faultReported: boolean
  faultDescription?: string | null
}

class Abort {
  constructor(readonly reason: CheckInFailure) {}
}

export async function performCheckIn(
  input: PerformCheckInInput,
): Promise<CheckInResult> {
  const parsed = checkinSubmissionSchema.safeParse({
    returnLocationId: input.returnLocationId,
    faultReported: input.faultReported,
    faultDescription: input.faultDescription ?? null,
  })
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  const { returnLocationId, faultReported, faultDescription } = parsed.data

  try {
    const result = await withOrgContext(input.orgId, async (tx) => {
      const machine = await machinesRepo.lockBySlug(tx, input.slug)
      if (!machine || !machine.active) throw new Abort('not-found')

      // 1. Lock the open checkout. 2. It must exist and be this employee's —
      //    someone else's checkout is not yours to close.
      const checkout = await checkoutsRepo.findOpenForMachineForUpdate(tx, machine.id)
      if (!checkout || checkout.employeeId !== input.employeeId) {
        throw new Abort('not-yours')
      }

      // The chosen location must be one of this org's active locations.
      const location = await locationsRepo.findActiveById(tx, returnLocationId)
      if (!location) throw new Abort('invalid')

      // 3. Close the checkout — this fires checkout_status_sync, which sets the
      //    machine back to 'available'.
      await checkoutsRepo.closeCheckout(tx, { checkoutId: checkout.id, returnLocationId })

      // 4. Record where it was returned.
      await machinesRepo.setCurrentLocation(tx, {
        machineId: machine.id,
        locationId: returnLocationId,
      })

      // 5. A reported fault overrides the 'available' the trigger just set.
      //    This must run after step 3; verify it actually took.
      let incidentId: string | null = null
      if (faultReported) {
        const incident = await incidentsRepo.insertOpen(tx, {
          machineId: machine.id,
          employeeId: input.employeeId,
          checkoutId: checkout.id,
          description: faultDescription as string,
        })
        incidentId = incident.id
        await machinesRepo.setStatus(tx, { machineId: machine.id, status: 'faulty' })
        const finalStatus = await machinesRepo.getStatus(tx, machine.id)
        if (finalStatus !== 'faulty') {
          // A genuine invariant violation — let it surface.
          throw new Error(`check-in: expected machine status 'faulty', got '${finalStatus}'`)
        }
      }

      // 6. Activity log.
      await activityRepo.log(tx, {
        machineId: machine.id,
        employeeId: input.employeeId,
        action: 'checkin',
        detail: {
          machineCode: machine.code,
          location: location.name,
          locationType: location.type,
          faultRaised: faultReported,
          incidentId,
        },
      })

      // 7. Commit (implicit on return).
      return { faultRaised: faultReported, incidentId }
    })

    return { ok: true, ...result }
  } catch (e) {
    if (e instanceof Abort) return { ok: false, reason: e.reason }
    throw e
  }
}
