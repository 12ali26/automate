import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { InactiveTag, StatusPill, Table } from '@/components/manage/ui'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import { formatDuration } from '@/lib/domain/duration'
import type { MachineHistoryEntry } from '@/lib/domain/types'
import * as checklistsRepo from '@/lib/repos/checklists'
import * as locationsRepo from '@/lib/repos/locations'
import * as machinesRepo from '@/lib/repos/machines'

import { MachineForm } from '../MachineForm'
import { RegenerateCodeButton } from './RegenerateCodeButton'

export const dynamic = 'force-dynamic'

const HISTORY_PAGE = 25

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

export default async function MachineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ h?: string }>
}) {
  const { org: slug, id } = await params
  const { h } = await searchParams
  const { session, org } = await requireManagerSession(slug)

  const hPage = Math.max(1, Number.parseInt(h ?? '1', 10) || 1)
  const hOffset = (hPage - 1) * HISTORY_PAGE

  const data = await withOrgContext(org.id, async (tx) => ({
    machine: await machinesRepo.findForManage(tx, id),
    locations: await locationsRepo.listActive(tx),
    templates: await checklistsRepo.listSummaries(tx),
    history: await machinesRepo.historyForManage(tx, id, { limit: HISTORY_PAGE, offset: hOffset }),
  }))

  if (!data.machine) notFound()
  const m = data.machine

  // Keep an already-attached but now-inactive template/location selectable so
  // saving the form does not silently drop it.
  const templateOptions = data.templates
    .filter((t) => t.active || t.id === m.templateId)
    .map((t) => ({ value: t.id, label: t.active ? t.name : `${t.name} (inactive)` }))
  const activeLocIds = new Set(data.locations.map((l) => l.id))
  const locationOptions = [
    ...data.locations.map((l) => ({ value: l.id, label: l.name })),
    ...(m.currentLocationId && !activeLocIds.has(m.currentLocationId)
      ? [{ value: m.currentLocationId, label: 'Current location (inactive)' }]
      : []),
  ]

  const totalHistoryPages = Math.max(1, Math.ceil(data.history.total / HISTORY_PAGE))

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <PageHead
        title={m.name}
        description={`Code ${m.code}`}
        action={
          <Link
            href={`/${slug}/manage/machines`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Back to list
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={m.status} />
        {!m.active ? <InactiveTag /> : null}
        {m.checkedOut ? (
          <span className="text-sm text-gray-500">Currently checked out</span>
        ) : null}
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-gray-950">Edit</h2>
        <MachineForm
          orgSlug={slug}
          machineId={m.id}
          defaults={{
            code: m.code,
            name: m.name,
            templateId: m.templateId,
            locationId: m.currentLocationId,
            active: m.active,
          }}
          templates={templateOptions}
          locations={locationOptions}
        />
      </section>

      <section className="mt-10 max-w-xl rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-bold text-gray-950">Sticker / QR code</h2>
        <p className="mt-1 text-sm text-gray-600">
          The sticker encodes a random slug, never the code above. Regenerate it only if a
          sticker is damaged or compromised — the old sticker stops working the instant you do,
          and a new one must be printed.
        </p>
        <div className="mt-3">
          <RegenerateCodeButton orgSlug={slug} machineId={m.id} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-gray-950">
          History <span className="text-sm font-semibold text-gray-400">{data.history.total}</span>
        </h2>
        <Table
          head={['When', 'Event', 'Who', 'Detail']}
          isEmpty={data.history.entries.length === 0}
          empty="Nothing has happened to this machine yet."
        >
          {data.history.entries.map((e, i) => (
            <tr key={i} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 text-gray-500">{when(e.at)}</td>
              <td className="px-4 py-3">
                <HistoryLabel entry={e} />
              </td>
              <td className="px-4 py-3 text-gray-700">
                {e.kind === 'checkout' ? (
                  <PersonCell fullName={e.employee.fullName} fmId={e.employee.fmId} />
                ) : (
                  <PersonCell fullName={e.reporter.fullName} fmId={e.reporter.fmId} />
                )}
              </td>
              <td className="px-4 py-3 text-gray-700">
                <HistoryDetail entry={e} />
              </td>
            </tr>
          ))}
        </Table>

        {totalHistoryPages > 1 ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm text-gray-600">
            {hPage > 1 ? (
              <Link
                href={`/${slug}/manage/machines/${m.id}?h=${hPage - 1}`}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold hover:bg-gray-100"
              >
                Newer
              </Link>
            ) : null}
            <span>
              Page {hPage} of {totalHistoryPages}
            </span>
            {hPage < totalHistoryPages ? (
              <Link
                href={`/${slug}/manage/machines/${m.id}?h=${hPage + 1}`}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold hover:bg-gray-100"
              >
                Older
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </ManageChrome>
  )
}

function PersonCell({ fullName, fmId }: { fullName: string; fmId: string }) {
  return (
    <span className="flex flex-col">
      <span>{fullName}</span>
      <span className="font-mono text-xs text-gray-500">FM {fmId}</span>
    </span>
  )
}

function HistoryLabel({ entry }: { entry: MachineHistoryEntry }) {
  if (entry.kind === 'checkout') {
    return (
      <span className="font-semibold text-gray-950">
        {entry.closedAt ? 'Checked out & returned' : 'Checked out'}
      </span>
    )
  }
  if (entry.kind === 'incident') {
    return (
      <span className="font-semibold text-amber-700">
        Fault {entry.status === 'cleared' ? '(cleared)' : '(open)'}
      </span>
    )
  }
  return (
    <span className="font-semibold text-slate-700">
      Reported missing {entry.status === 'resolved' ? '(resolved)' : '(open)'}
    </span>
  )
}

function HistoryDetail({ entry }: { entry: MachineHistoryEntry }) {
  if (entry.kind === 'checkout') {
    if (!entry.closedAt) return <span className="text-gray-500">Still out</span>
    return (
      <span>
        Out {formatDuration(entry.at, new Date(entry.closedAt))}
        {entry.returnLocation ? ` · returned to ${entry.returnLocation.name}` : ''}
      </span>
    )
  }
  if (entry.kind === 'incident') return <span>{entry.description}</span>
  return (
    <span>
      {entry.expectedLocation ? `Expected at ${entry.expectedLocation.name}` : 'No expected location'}
    </span>
  )
}
