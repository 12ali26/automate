import Link from 'next/link'

import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { InactiveTag, Table } from '@/components/manage/ui'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as checklistsRepo from '@/lib/repos/checklists'

import { TemplateCreateForm } from './TemplateCreateForm'

export const dynamic = 'force-dynamic'

export default async function ManageTemplatesPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const { session, org } = await requireManagerSession(slug)

  const rows = await withOrgContext(org.id, (tx) => checklistsRepo.listForManage(tx))

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <PageHead
        title="Checklist templates"
        description="A template is the list of checks a person works through when taking a machine out. Attach one to a machine on its detail screen."
      />

      <div className="mb-6 max-w-xl rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-950">New template</h2>
        <TemplateCreateForm orgSlug={slug} />
      </div>

      <Table
        head={['Name', 'Items', 'Machines using it', 'Status', '']}
        isEmpty={rows.length === 0}
        empty="No templates yet."
      >
        {rows.map((t) => (
          <tr key={t.id} className="align-middle">
            <td className="px-4 py-3 font-semibold text-gray-950">{t.name}</td>
            <td className="px-4 py-3 tabular-nums text-gray-700">{t.itemCount}</td>
            <td className="px-4 py-3 tabular-nums text-gray-700">{t.machineCount}</td>
            <td className="px-4 py-3">
              {t.active ? <span className="text-sm text-green-700">Active</span> : <InactiveTag />}
            </td>
            <td className="px-4 py-3 text-right">
              <Link
                href={`/${slug}/manage/templates/${t.id}`}
                className="text-sm font-semibold text-gray-700 underline hover:text-gray-950"
              >
                Edit items
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </ManageChrome>
  )
}
