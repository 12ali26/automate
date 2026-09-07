import { notFound } from 'next/navigation'

import { MachineHeader } from '@/components/machine/MachineHeader'
import { MachineStateView, type MachineView } from '@/components/machine/MachineStateView'
import { MachineStatus, type MachineStatusView } from '@/components/machine/MachineStatus'
import { withOrgContext } from '@/lib/auth/org-context'
import { requireStaffSession } from '@/lib/auth/session'
import { formatDuration } from '@/lib/domain/duration'
import * as checkoutsRepo from '@/lib/repos/checkouts'
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

    const otherHolder =
      checkout && checkout.employeeId !== session.employeeId
        ? await employeesRepo.findById(tx, checkout.employeeId)
        : null

    return { machine, checkout, incident, otherHolder }
  })

  if (!data) notFound()
  const { machine, checkout, incident, otherHolder } = data

  const location = machine.currentLocation
  // Derived, not stored: last returned somewhere other than the store.
  const offStore = Boolean(location && location.type !== 'store')

  let view: MachineView
  if (machine.status === 'faulty') {
    view = {
      state: 'faulty',
      description: incident?.description ?? null,
      reportedLabel: incident ? clock(incident.createdAt) : null,
    }
  } else if (machine.status === 'checked_out' && checkout) {
    const mine = checkout.employeeId === session.employeeId
    view = mine
      ? {
          state: 'out_by_me',
          duration: formatDuration(checkout.openedAt),
          sinceLabel: clock(checkout.openedAt),
        }
      : {
          state: 'out_by_other',
          holderName: otherHolder?.fullName ?? 'another employee',
          duration: formatDuration(checkout.openedAt),
          sinceLabel: clock(checkout.openedAt),
        }
  } else {
    view = { state: 'available' }
  }

  // The status/location line. A checked-out machine shows no location — it is
  // with its holder, not at its last return spot.
  const statusView: MachineStatusView =
    view.state === 'faulty'
      ? { state: 'faulty', locationName: location?.name ?? null, offStore }
      : view.state === 'available'
        ? { state: 'available', locationName: location?.name ?? null, offStore }
        : { state: 'checked_out' }

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
      <MachineStateView view={view} basePath={`/${orgSlug}/m/${machineSlug}`} />
    </main>
  )
}
