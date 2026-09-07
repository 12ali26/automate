import { headers } from 'next/headers'

import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as locationsRepo from '@/lib/repos/locations'
import * as machinesRepo from '@/lib/repos/machines'

import { PrintSheet } from './PrintSheet'

export const dynamic = 'force-dynamic'

export default async function PrintLabelsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const { session, org } = await requireManagerSession(slug)

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`

  const { machines, locations } = await withOrgContext(org.id, async (tx) => ({
    machines: await machinesRepo.listForPrint(tx),
    locations: await locationsRepo.listActive(tx),
  }))

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <div className="screen-only">
        <PageHead
          title="Print QR labels"
          description="Select machines, then print. Each label carries only the machine name, its code and the QR — laminate and cut along the guides."
        />
      </div>
      <PrintSheet
        orgSlug={slug}
        origin={origin}
        machines={machines}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      />
    </ManageChrome>
  )
}
