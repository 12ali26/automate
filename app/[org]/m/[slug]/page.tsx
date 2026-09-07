import { notFound } from 'next/navigation'

import { MachineHeader } from '@/components/machine/MachineHeader'
import { MachineStateView, type MachineView } from '@/components/machine/MachineStateView'
import { MachineStatus, type MachineStatusView } from '@/components/machine/MachineStatus'
import { withOrgContext } from '@/lib/auth/org-context'
import { requireStaffSession } from '@/lib/auth/session'
import { formatDuration } from '@/lib/domain/duration'
import * as checkoutsRepo from '@/lib/repos/checkouts'
import * as discrepanciesRepo from '@/lib/repos/discrepancies'
import * as employeesRepo from '@/lib/repos/employees'
import * as incidentsRepo from '@/lib/repos/incidents'
import * as machinesRepo from '@/lib/repos/machines'

// A stale machine state here causes a failed checkout — never cache this page.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const clock = (isoString: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString))

const DONE_MESSAGE: Record<string, string> = {
  checkout: 'Checked out. It’s yours now.',
  checkin: 'Checked in. Thanks.',
  fault: 'Fault reported. A manager will take it from here.',
}

export default async function MachinePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; slug: string }>
  searchParams: Promise<{ done?: string | string[] }>
}) {
  const { org: orgSlug, slug: machineSlug } = await params
  const { done } = await searchParams
  const doneMessage = typeof done === 'string' ? DONE_MESSAGE[done] : undefined
  const { session, org } = await requireStaffSession(orgSlug)

  const data = await withOrgContext(org.id, async (tx) => {
    const machine = await machinesRepo.findBySlug(tx, machineSlug)
    // Never disclose whether the slug exists in another org.
    if (!machine || !machine.active) return null

    // Sequential: a transaction is a single connection.
    const checkout = await checkoutsRepo.findOpenForMachine(tx, machine.id)
    const incident = await incidentsRepo.findOpenForMachine(tx, machine.id)
    const discrepancy = await discrepanciesRepo.findOpenForMachine(tx, machine.id)

    const otherHolder =
      checkout && checkout.employeeId !== session.employeeId
        ? await employeesRepo.findById(tx, checkout.employeeId)
        : null

    return { machine, checkout, incident, discrepancy, otherHolder }
  })

  if (!data) notFound()
  const { machine, checkout, incident, discrepancy, otherHolder } = data

  const location = machine.currentLocation
  // Derived, not stored: last returned somewhere other than the store.
  const offStore = Boolean(location && location.type !== 'store')
  const mineCheckout = Boolean(checkout && checkout.employeeId === session.employeeId)
  const basePath = `/${orgSlug}/m/${machineSlug}`

  // Independent facts — a machine can be held AND faulty at once.
  const fault =
    machine.status === 'faulty'
      ? {
          description: incident?.description ?? null,
          reportedLabel: incident ? clock(incident.createdAt) : null,
        }
      : null

  const holder: MachineView['holder'] = checkout
    ? mineCheckout
      ? {
          mine: true,
          duration: formatDuration(checkout.openedAt),
          sinceLabel: clock(checkout.openedAt),
        }
      : {
          mine: false,
          name: otherHolder?.fullName ?? 'another employee',
          duration: formatDuration(checkout.openedAt),
          sinceLabel: clock(checkout.openedAt),
        }
    : null

  const missing = discrepancy !== null

  // "Report a fault" is offered when the machine is available (anyone spotted a
  // problem) or held by the current employee. Never when it's already faulty or
  // held by someone else — they report it.
  const canReportFault =
    machine.status !== 'faulty' && (machine.status === 'available' || mineCheckout)

  const view: MachineView = {
    fault,
    holder,
    missing,
    actions: {
      checkOutHref: machine.status === 'available' ? `${basePath}/checkout` : undefined,
      checkInHref: mineCheckout ? `${basePath}/checkin` : undefined,
      reportFaultHref: canReportFault ? `${basePath}/incident` : undefined,
    },
  }

  const statusView: MachineStatusView = {
    state: machine.status,
    locationName: location?.name ?? null,
    offStore,
    missing,
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-5">
      <MachineHeader name={machine.name} code={machine.code} />
      {doneMessage ? (
        <p
          role="status"
          className="rounded-xl border-2 border-green-600 bg-green-50 px-4 py-3 text-base font-bold text-green-950"
        >
          {doneMessage}
        </p>
      ) : null}
      <MachineStatus view={statusView} />
      <MachineStateView view={view} />
    </main>
  )
}
