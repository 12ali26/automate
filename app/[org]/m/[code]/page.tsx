import { notFound } from 'next/navigation'

import { MachineHeader } from '@/components/machine/MachineHeader'
import { MachineStateView, type MachineView } from '@/components/machine/MachineStateView'
import { StateBadge, type BadgeState } from '@/components/machine/StateBadge'
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

export default async function MachinePage({
  params,
}: {
  params: Promise<{ org: string; code: string }>
}) {
  const { org: slug, code } = await params
  const { session, org } = await requireStaffSession(slug)

  const data = await withOrgContext(org.id, async (tx) => {
    const machine = await machinesRepo.findByCode(tx, code)
    // Never disclose whether the code exists in another org.
    if (!machine || !machine.active) return null

    // Sequential: a transaction is a single connection, so repo calls here run
    // one after another.
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

  const badge: BadgeState =
    view.state === 'faulty' ? 'faulty' : view.state === 'available' ? 'available' : 'out'

  return (
    <main className="flex flex-1 flex-col gap-5 p-5">
      <MachineHeader
        name={machine.name}
        code={machine.code}
        locationName={location?.name ?? null}
        locationOffStore={offStore}
      />
      <StateBadge state={badge} />
      <MachineStateView view={view} />
    </main>
  )
}
