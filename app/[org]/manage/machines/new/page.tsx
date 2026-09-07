import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as checklistsRepo from '@/lib/repos/checklists'
import * as locationsRepo from '@/lib/repos/locations'

import { MachineForm } from '../MachineForm'

export const dynamic = 'force-dynamic'

export default async function NewMachinePage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const { session, org } = await requireManagerSession(slug)

  const { locations, templates } = await withOrgContext(org.id, async (tx) => ({
    locations: await locationsRepo.listActive(tx),
    templates: await checklistsRepo.listSummaries(tx),
  }))

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <PageHead
        title="New machine"
        description="The QR slug is generated automatically once the machine is created."
      />
      <MachineForm
        orgSlug={slug}
        templates={templates.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))}
        locations={locations.map((l) => ({ value: l.id, label: l.name }))}
      />
    </ManageChrome>
  )
}
