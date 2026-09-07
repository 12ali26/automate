import { withOrgContext } from '@/lib/auth/org-context'
import * as activityRepo from '@/lib/repos/activity'
import * as checkoutsRepo from '@/lib/repos/checkouts'
import * as discrepanciesRepo from '@/lib/repos/discrepancies'
import * as machinesRepo from '@/lib/repos/machines'

/**
 * Report that a machine is not where the fleet view says it is. This is the one
 * exception to scan-only access — the machine isn't there to scan, which is the
 * entire point of the report.
 *
 * It is a flag on the machine, never a status change: "missing" is not
 * "faulty". Worded as a fact about the machine; the link to whoever last had it
 * is made in the data, not shown to the reporter.
 */

export type ReportDiscrepancyFailure =
  | 'not-found' //        machine slug unknown here, or machine inactive
  | 'not-available' //    a checked-out or faulty machine isn't "missing"
  | 'already-reported' // an open discrepancy already exists

export type ReportDiscrepancyResult =
  | { ok: true; discrepancyId: string }
  | { ok: false; reason: ReportDiscrepancyFailure }

export interface PerformReportDiscrepancyInput {
  orgId: string
  employeeId: string
  /** The machine's URL slug (not its human code). */
  slug: string
}

class Abort {
  constructor(readonly reason: ReportDiscrepancyFailure) {}
}

export async function performReportDiscrepancy(
  input: PerformReportDiscrepancyInput,
): Promise<ReportDiscrepancyResult> {
  try {
    const result = await withOrgContext(input.orgId, async (tx) => {
      const machine = await machinesRepo.lockBySlug(tx, input.slug)
      if (!machine || !machine.active) throw new Abort('not-found')

      // 1. Only an 'available' machine can be missing — a checked-out one is
      //    with someone, a faulty one is already flagged.
      if (machine.status !== 'available') throw new Abort('not-available')

      // 2. No open discrepancy already.
      const existing = await discrepanciesRepo.findOpenForMachine(tx, machine.id)
      if (existing) throw new Abort('already-reported')

      // 3. The last person known to have had it.
      const lastCheckout = await checkoutsRepo.findLastClosedForMachine(tx, machine.id)

      // 4. Raise the discrepancy against the machine's expected location.
      const discrepancy = await discrepanciesRepo.insertOpen(tx, {
        machineId: machine.id,
        reportedBy: input.employeeId,
        lastCheckoutId: lastCheckout?.id ?? null,
        expectedLocationId: machine.currentLocationId,
      })

      // 5. Activity log. 6. Machine status is deliberately NOT changed.
      await activityRepo.log(tx, {
        machineId: machine.id,
        employeeId: input.employeeId,
        action: 'discrepancy_reported',
        detail: {
          machineCode: machine.code,
          discrepancyId: discrepancy.id,
          expectedLocationId: machine.currentLocationId,
          lastCheckoutId: lastCheckout?.id ?? null,
        },
      })

      // 7. Commit.
      return { discrepancyId: discrepancy.id }
    })

    return { ok: true, ...result }
  } catch (e) {
    if (e instanceof Abort) return { ok: false, reason: e.reason }
    throw e
  }
}
