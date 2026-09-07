import Link from 'next/link'

import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { InactiveTag, StatusPill, Table } from '@/components/manage/ui'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import type { MachineStatus } from '@/lib/domain/types'
import * as locationsRepo from '@/lib/repos/locations'
import * as machinesRepo from '@/lib/repos/machines'

import { MachineFilters } from './MachineFilters'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const STATUSES: MachineStatus[] = ['available', 'checked_out', 'faulty']

export default async function ManageMachinesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ status?: string; location?: string; page?: string }>
}) {
  const { org: slug } = await params
  const { status, location, page } = await searchParams
  const { session, org } = await requireManagerSession(slug)

  const statusFilter = STATUSES.includes(status as MachineStatus)
    ? (status as MachineStatus)
    : undefined
  const pageNum = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)
  const offset = (pageNum - 1) * PAGE_SIZE

  const { locations, list } = await withOrgContext(org.id, async (tx) => ({
    locations: await locationsRepo.listActive(tx),
    list: await machinesRepo.listForManage(tx, {
      status: statusFilter,
      locationId: location || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  }))

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  const firstShown = list.total === 0 ? 0 : offset + 1
  const lastShown = offset + list.rows.length
  const qs = (next: number) => {
    const p = new URLSearchParams()
    if (statusFilter) p.set('status', statusFilter)
    if (location) p.set('location', location)
    if (next > 1) p.set('page', String(next))
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <PageHead
        title="Machines"
        description="Every machine in this facility. The QR slug lives on the sticker — it is never shown here."
        action={
          <div className="flex gap-2">
            <Link
              href={`/${slug}/manage/machines/print`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Print labels
            </Link>
            <Link
              href={`/${slug}/manage/machines/new`}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              New machine
            </Link>
          </div>
        }
      />

      <MachineFilters
        orgSlug={slug}
        status={statusFilter ?? ''}
        location={location ?? ''}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      />

      <div className="mt-4">
        <Table
          head={['Code', 'Name', 'Location', 'Status', 'Checklist', '']}
          isEmpty={list.rows.length === 0}
          empty="No machines match this filter."
        >
          {list.rows.map((m) => (
            <tr key={m.id} className="align-middle">
              <td className="px-4 py-3 font-mono text-xs text-gray-700">{m.code}</td>
              <td className="px-4 py-3 font-semibold text-gray-950">
                {m.name}
                {!m.active ? <span className="ml-2"><InactiveTag /></span> : null}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {m.currentLocation ? (
                  <span className={m.currentLocation.active ? '' : 'text-gray-400'}>
                    {m.currentLocation.name}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3"><StatusPill status={m.status} /></td>
              <td className="px-4 py-3 text-gray-700">
                {m.template ? m.template.name : <span className="text-gray-400">None</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/${slug}/manage/machines/${m.id}`}
                  className="text-sm font-semibold text-gray-700 underline hover:text-gray-950"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <span>
          {firstShown}–{lastShown} of {list.total}
        </span>
        <span className="flex gap-2">
          {pageNum > 1 ? (
            <Link href={`/${slug}/manage/machines${qs(pageNum - 1)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold hover:bg-gray-100">
              Previous
            </Link>
          ) : null}
          {pageNum < totalPages ? (
            <Link href={`/${slug}/manage/machines${qs(pageNum + 1)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold hover:bg-gray-100">
              Next
            </Link>
          ) : null}
        </span>
      </div>
    </ManageChrome>
  )
}
