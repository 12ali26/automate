import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as checklistsRepo from '@/lib/repos/checklists'

import { TemplateEditor } from './TemplateEditor'

export const dynamic = 'force-dynamic'

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>
}) {
  const { org: slug, id } = await params
  const { session, org } = await requireManagerSession(slug)

  const template = await withOrgContext(org.id, (tx) => checklistsRepo.findForManage(tx, id))
  if (!template) notFound()

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <PageHead
        title={template.name}
        description="Checklist template"
        action={
          <Link
            href={`/${slug}/manage/templates`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Back to list
          </Link>
        }
      />
      <TemplateEditor
        orgSlug={slug}
        templateId={template.id}
        initialName={template.name}
        initialActive={template.active}
        initialItems={template.items.map((it) => ({
          id: it.id,
          label: it.label,
          blocking: it.blocking,
        }))}
      />
    </ManageChrome>
  )
}
