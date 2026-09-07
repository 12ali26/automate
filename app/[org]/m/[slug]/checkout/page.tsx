import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MachineHeader } from '@/components/machine/MachineHeader'
import { withOrgContext } from '@/lib/auth/org-context'
import { requireStaffSession } from '@/lib/auth/session'
import * as checklistsRepo from '@/lib/repos/checklists'
import * as machinesRepo from '@/lib/repos/machines'

import { CheckoutForm } from './CheckoutForm'

// A stale machine state here causes a failed checkout — never cache this page.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>
}) {
  const { org: orgSlug, slug: machineSlug } = await params
  const { org } = await requireStaffSession(orgSlug)

  const data = await withOrgContext(org.id, async (tx) => {
    const machine = await machinesRepo.findBySlug(tx, machineSlug)
    if (!machine || !machine.active) return null

    const items =
      machine.status === 'available' && machine.templateId
        ? await checklistsRepo.itemsForTemplate(tx, machine.templateId)
        : []

    return { machine, items }
  })

  if (!data) notFound()
  const { machine, items } = data

  const backHref = `/${orgSlug}/m/${machineSlug}`

  // Re-verified on load: if it isn't available now, don't show the form.
  if (machine.status !== 'available') {
    return (
      <main className="flex flex-1 flex-col gap-4 p-5">
        <MachineHeader name={machine.name} code={machine.code} />
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-4">
          <p className="text-lg font-semibold text-gray-950">
            This machine can&rsquo;t be checked out right now.
          </p>
          <p className="mt-1 text-base text-gray-700">
            {machine.status === 'checked_out'
              ? 'Someone else has it checked out.'
              : 'It has been marked out of service.'}
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

  return (
    <main className="flex flex-1 flex-col gap-4 p-5">
      <MachineHeader name={machine.name} code={machine.code} />
      <p className="text-base font-semibold uppercase tracking-wide text-gray-600">
        Checkout
      </p>
      <CheckoutForm orgSlug={orgSlug} slug={machineSlug} items={items} backHref={backHref} />
    </main>
  )
}
