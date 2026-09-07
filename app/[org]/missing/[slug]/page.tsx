import Link from 'next/link'
import { notFound } from 'next/navigation'

import { withOrgContext } from '@/lib/auth/org-context'
import { requireStaffSession } from '@/lib/auth/session'
import * as discrepanciesRepo from '@/lib/repos/discrepancies'
import * as machinesRepo from '@/lib/repos/machines'

import { NotHereConfirm } from './NotHereConfirm'

// This is the one scan-free path — the machine isn't there to scan. It is a
// confirmation, not the machine page, and it must reflect live state.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MissingPage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>
}) {
  const { org: orgSlug, slug: machineSlug } = await params
  const { org } = await requireStaffSession(orgSlug)

  const data = await withOrgContext(org.id, async (tx) => {
    const machine = await machinesRepo.findBySlug(tx, machineSlug)
    if (!machine || !machine.active) return null
    const openDiscrepancy = await discrepanciesRepo.findOpenForMachine(tx, machine.id)
    return { machine, alreadyReported: openDiscrepancy !== null }
  })

  if (!data) notFound()
  const { machine, alreadyReported } = data

  const fleetHref = `/${orgSlug}/fleet`
  const locationName = machine.currentLocation?.name ?? 'its expected location'

  const blocked =
    machine.status !== 'available'
      ? machine.status === 'checked_out'
        ? 'That machine is checked out — someone has it. It isn’t missing.'
        : 'That machine is already flagged as faulty.'
      : alreadyReported
        ? `${machine.name} has already been reported as not in place. A supervisor will look into it.`
        : null

  return (
    <main className="flex flex-1 flex-col gap-4 p-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">
        {machine.name}
      </h1>
      <p className="font-mono text-sm text-gray-500">{machine.code}</p>

      {blocked ? (
        <>
          <div className="rounded-xl border border-gray-300 bg-gray-50 p-4">
            <p className="text-base text-gray-800">{blocked}</p>
          </div>
          <Link
            href={fleetHref}
            className="w-full rounded-xl bg-gray-950 px-6 py-4 text-center text-lg font-bold text-white active:bg-gray-800"
          >
            Back to fleet
          </Link>
        </>
      ) : (
        <NotHereConfirm
          orgSlug={orgSlug}
          slug={machineSlug}
          machineName={machine.name}
          locationName={locationName}
          fleetHref={fleetHref}
        />
      )}
    </main>
  )
}
