import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { Table } from '@/components/manage/ui'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as locationsRepo from '@/lib/repos/locations'

import { LocationCreateForm } from './LocationCreateForm'
import { LocationRow } from './LocationRow'

export const dynamic = 'force-dynamic'

export default async function ManageLocationsPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const { session, org } = await requireManagerSession(slug)

  const { rows, activeStores } = await withOrgContext(org.id, async (tx) => ({
    rows: await locationsRepo.listForManage(tx),
    activeStores: await locationsRepo.countActiveStores(tx),
  }))

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <PageHead
        title="Locations"
        description="Stores and housekeeping points. The facility must always keep at least one active store."
      />

      <div className="mb-6 max-w-xl rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-950">Add a location</h2>
        <LocationCreateForm orgSlug={slug} />
      </div>

      <Table
        head={['Name', 'Type', 'Machines here', 'Status', '']}
        isEmpty={rows.length === 0}
        empty="No locations yet."
      >
        {rows.map((l) => (
          <LocationRow
            key={l.id}
            orgSlug={slug}
            location={l}
            isLastActiveStore={l.active && l.type === 'store' && activeStores <= 1}
          />
        ))}
      </Table>
    </ManageChrome>
  )
}
