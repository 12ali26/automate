import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MachineHeader } from '@/components/machine/MachineHeader'
import { withOrgContext } from '@/lib/auth/org-context'
import { requireStaffSession } from '@/lib/auth/session'
import * as checkoutsRepo from '@/lib/repos/checkouts'
import * as locationsRepo from '@/lib/repos/locations'
import * as machinesRepo from '@/lib/repos/machines'

import { CheckinForm } from './CheckinForm'

// A stale machine state here causes a failed check-in — never cache this page.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CheckinPage({
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
    const mine = Boolean(checkout && checkout.employeeId === session.employeeId)
    const locations = mine ? await locationsRepo.listActive(tx) : []

    return { machine, mine, locations }
  })

  if (!data) notFound()
  const { machine, mine, locations } = data

  const backHref = `/${orgSlug}/m/${machineSlug}`

  // Someone else's checkout (or none open) is not yours to close.
  if (!mine) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-5">
        <MachineHeader name={machine.name} code={machine.code} />
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-4">
          <p className="text-lg font-semibold text-gray-950">
            You don&rsquo;t have this machine checked out.
          </p>
          <p className="mt-1 text-base text-gray-700">
            Only the person who checked a machine out can check it back in.
          </p>
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

  // The 'store' location is the preferred, pre-selected default.
  const defaultLocationId =
    locations.find((l) => l.type === 'store')?.id ?? locations[0]?.id ?? ''

  return (
    <main className="flex flex-1 flex-col gap-4 p-5">
      <MachineHeader name={machine.name} code={machine.code} />
      <p className="text-base font-semibold uppercase tracking-wide text-gray-600">
        Check in
      </p>
      <CheckinForm
        orgSlug={orgSlug}
        slug={machineSlug}
        locations={locations}
        defaultLocationId={defaultLocationId}
        backHref={backHref}
      />
    </main>
  )
}
