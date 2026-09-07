import { withOrgContext } from '@/lib/auth/org-context'
import * as activityRepo from '@/lib/repos/activity'
import * as checkoutsRepo from '@/lib/repos/checkouts'
import * as incidentsRepo from '@/lib/repos/incidents'
import * as machinesRepo from '@/lib/repos/machines'
import { incidentSubmissionSchema } from '@/lib/validation/incident'

/**
 * Report a fault WITHOUT returning the machine — one you found broken on the
 * shelf, or one you're holding and want flagged now. (Check-in has its own
 * "something's wrong" path.)
 *
 * CRITICAL: reporting a fault on a machine you hold does NOT close your
 * checkout. You still have it; it's just flagged. The machine ends up both
 * checked_out (open checkout still there) and faulty (status column). You still
 * have to scan it back in.
 */

export type ReportFaultFailure =
  | 'not-found' //     machine slug unknown here, or machine inactive
  | 'invalid' //       description did not parse
  | 'already-faulty' // an open incident already exists
  | 'not-yours' //      held by someone else — they report it

export type ReportFaultResult =
  | { ok: true; incidentId: string }
  | { ok: false; reason: ReportFaultFailure }

export interface PerformReportFaultInput {
  orgId: string
  employeeId: string
  /** The machine's URL slug (not its human code). */
  slug: string
  description: string
}

class Abort {
  constructor(readonly reason: ReportFaultFailure) {}
}

export async function performReportFault(
  input: PerformReportFaultInput,
): Promise<ReportFaultResult> {
  const parsed = incidentSubmissionSchema.safeParse({ description: input.description })
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  const { description } = parsed.data

  try {
    const result = await withOrgContext(input.orgId, async (tx) => {
      // 1. Lock the machine row.
      const machine = await machinesRepo.lockBySlug(tx, input.slug)
      if (!machine || !machine.active) throw new Abort('not-found')

      // 2. Not already faulty.
      if (machine.status === 'faulty') throw new Abort('already-faulty')

      // 3. If it's checked out, the holder must be the current employee.
      const checkout = await checkoutsRepo.findOpenForMachineForUpdate(tx, machine.id)
      if (checkout && checkout.employeeId !== input.employeeId) {
        throw new Abort('not-yours')
      }

      // 4. Raise the incident, linked to the open checkout if there is one.
      const incident = await incidentsRepo.insertOpen(tx, {
        machineId: machine.id,
        employeeId: input.employeeId,
        checkoutId: checkout?.id ?? null,
        description,
      })

      // 5. Mark the machine faulty. This does NOT touch the checkout — a held
      //    machine stays held.
      await machinesRepo.setStatus(tx, { machineId: machine.id, status: 'faulty' })

      // 6. Activity log.
      await activityRepo.log(tx, {
        machineId: machine.id,
        employeeId: input.employeeId,
        action: 'fault_reported',
        detail: {
          machineCode: machine.code,
          incidentId: incident.id,
          checkoutId: checkout?.id ?? null,
          whileHeld: checkout !== null,
        },
      })

      // 7. Commit.
      return { incidentId: incident.id }
    })

    return { ok: true, ...result }
  } catch (e) {
    if (e instanceof Abort) return { ok: false, reason: e.reason }
    throw e
  }
}
