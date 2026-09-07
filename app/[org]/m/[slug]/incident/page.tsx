import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MachineHeader } from '@/components/machine/MachineHeader'
import { withOrgContext } from '@/lib/auth/org-context'
import { requireStaffSession } from '@/lib/auth/session'
import * as checkoutsRepo from '@/lib/repos/checkouts'
import * as machinesRepo from '@/lib/repos/machines'

import { IncidentForm } from './IncidentForm'

// The machine state gates this form — never cache it.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>
}) {
  const { org: orgSlug, slug: machineSlug } = await params
  const { session, org } = await requireStaffSession(orgSlug)

  const data = await withOrgContext(org.id, async (tx) => {
    const machine = await machinesRepo.findBySlug(tx, machineSlug)
    if (!machine || !machine.active) return null

    const checkout = await checkoutsRepo.findOpenForMachine(tx, machine.id)
    const heldByOther = Boolean(checkout && checkout.employeeId !== session.employeeId)

    return { machine, heldByOther }
  })

  if (!data) notFound()
  const { machine, heldByOther } = data

  const backHref = `/${orgSlug}/m/${machineSlug}`

  // Re-verified on load. Already faulty → nothing to report. Held by someone
  // else → it's theirs to report.
  const blocked =
    machine.status === 'faulty'
      ? 'A fault has already been reported on this machine. A manager will clear it.'
      : heldByOther
        ? 'Someone else has this machine checked out. They report anything wrong with it.'
        : null

  if (blocked) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-5">
        <MachineHeader name={machine.name} code={machine.code} />
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-4">
          <p className="text-base text-gray-800">{blocked}</p>
        </div>
        <Link
          href={backHref}
          className="w-full rounded-xl bg-gray-950 px-6 py-4 text-center text-lg font-bold text-white active:bg-gray-800"
        >
          Back to machine
        </Link>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-5">
      <MachineHeader name={machine.name} code={machine.code} />
      <p className="text-base font-semibold uppercase tracking-wide text-gray-600">
        Report a fault
      </p>
      <IncidentForm orgSlug={orgSlug} slug={machineSlug} backHref={backHref} />
    </main>
  )
}
