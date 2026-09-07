import { ManageChrome, PageHead } from '@/components/manage/ManageChrome'
import { managerSignOutAction } from '@/lib/auth/manager-actions'
import { requireManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import { formatDuration } from '@/lib/domain/duration'
import { isOverdue, overdueDeadline, parseShiftSettings } from '@/lib/domain/shifts'
import * as checkoutsRepo from '@/lib/repos/checkouts'
import * as discrepanciesRepo from '@/lib/repos/discrepancies'
import * as incidentsRepo from '@/lib/repos/incidents'
import * as machinesRepo from '@/lib/repos/machines'

import { clearFaultAction, resolveDiscrepancyAction } from './actions'
import { ManagerActionButton } from './ManagerActionButton'

// A glance-at screen: 30s of staleness is fine.
export const revalidate = 30

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

export default async function ManagerDashboardPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const { session, org } = await requireManagerSession(slug)

  const data = await withOrgContext(org.id, async (tx) => ({
    counts: await machinesRepo.countByStatus(tx),
    openCheckouts: await checkoutsRepo.listOpenWithDetail(tx),
    openIncidents: await incidentsRepo.listOpenWithDetail(tx),
    openDiscrepancies: await discrepanciesRepo.listOpenWithDetail(tx),
  }))

  const shift = parseShiftSettings(org.settings)
  const now = new Date()

  const outRows = data.openCheckouts.map((c) => {
    const deadline = overdueDeadline(new Date(c.openedAt), shift)
    return {
      ...c,
      deadline,
      overdue: isOverdue({ openedAt: c.openedAt }, shift, now),
    }
  })
  // Most overdue first == earliest deadline first.
  const overdue = outRows
    .filter((r) => r.overdue)
    .sort((a, b) => (a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0))
  // Everything out, longest first (listOpenWithDetail is already opened_at asc).
  const currentlyOut = outRows

  return (
    <ManageChrome
      orgSlug={slug}
      orgName={org.name}
      managerName={session.fullName}
      signOutAction={managerSignOutAction.bind(null, slug)}
    >
      <PageHead title="Dashboard" />

      <section className="flex flex-wrap gap-3 sm:gap-4">
        <StatCard label="Available" value={data.counts.available} tone="green" />
        <StatCard label="Checked out" value={data.counts.checked_out} tone="blue" />
        <StatCard label="Faulty" value={data.counts.faulty} tone="red" />
      </section>

      {/* 1. OVERDUE */}
      <DashSection
        title="Overdue"
        count={overdue.length}
        tone="red"
        empty="Nothing is overdue."
        hint={
          shift.shiftBoundaries.length === 0
            ? 'No shift boundaries configured — overdue tracking is off.'
            : `Shift boundaries ${shift.shiftBoundaries.join(', ')} · ${shift.graceMinutes} min grace · ${shift.timezone}`
        }
      >
        {overdue.length > 0 ? (
          <Rows
            head={['Machine', 'Holder', 'Out for', 'Past deadline by']}
            rows={overdue.map((r) => [
              <MachineCell key="m" code={r.machine.code} name={r.machine.name} />,
              <HolderCell key="h" name={r.holder.fullName} fmId={r.holder.fmId} />,
              <span key="o">{formatDuration(r.openedAt, now)}</span>,
              <span key="d" className="font-semibold text-red-700">
                {r.deadline ? formatDuration(r.deadline, now) : '—'}
              </span>,
            ])}
          />
        ) : null}
      </DashSection>

      {/* 2. OPEN FAULTS */}
      <DashSection
        title="Open faults"
        count={data.openIncidents.length}
        tone="amber"
        empty="No open faults."
      >
        {data.openIncidents.length > 0 ? (
          <Rows
            head={['Machine', 'Reported by', 'Description', 'When', '']}
            rows={data.openIncidents.map((i) => [
              <MachineCell key="m" code={i.machine.code} name={i.machine.name} />,
              <HolderCell key="r" name={i.reporter.fullName} fmId={i.reporter.fmId} />,
              <span key="desc" className="text-gray-700">
                {i.description}
              </span>,
              <span key="w" className="whitespace-nowrap text-gray-500">
                {when(i.createdAt)}
              </span>,
              <ManagerActionButton
                key="a"
                label="Clear fault"
                pendingLabel="Clearing…"
                action={clearFaultAction.bind(null, slug, i.id)}
              />,
            ])}
          />
        ) : null}
      </DashSection>

      {/* 3. REPORTED MISSING */}
      <DashSection
        title="Reported missing"
        count={data.openDiscrepancies.length}
        tone="slate"
        empty="Nothing reported missing."
      >
        {data.openDiscrepancies.length > 0 ? (
          <Rows
            head={['Machine', 'Reported by', 'Expected at', 'Last holder', 'When', '']}
            rows={data.openDiscrepancies.map((d) => [
              <MachineCell key="m" code={d.machine.code} name={d.machine.name} />,
              <span key="r" className="text-gray-700">
                {d.reporter.fullName}
              </span>,
              <span key="l" className="text-gray-700">
                {d.expectedLocation?.name ?? '—'}
              </span>,
              <span key="lh" className="text-gray-700">
                {d.lastHolder?.fullName ?? '—'}
              </span>,
              <span key="w" className="whitespace-nowrap text-gray-500">
                {when(d.createdAt)}
              </span>,
              <ManagerActionButton
                key="a"
                label="Resolve"
                pendingLabel="Resolving…"
                action={resolveDiscrepancyAction.bind(null, slug, d.id)}
              />,
            ])}
          />
        ) : null}
      </DashSection>

      {/* 4. CURRENTLY OUT */}
      <DashSection
        title="Currently out"
        count={currentlyOut.length}
        tone="gray"
        empty="Nothing is checked out."
      >
        {currentlyOut.length > 0 ? (
          <Rows
            head={['Machine', 'Holder', 'Out for', '']}
            rows={currentlyOut.map((r) => [
              <MachineCell key="m" code={r.machine.code} name={r.machine.name} />,
              <HolderCell key="h" name={r.holder.fullName} fmId={r.holder.fmId} />,
              <span key="o">{formatDuration(r.openedAt, now)}</span>,
              r.overdue ? (
                <span
                  key="t"
                  className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
                >
                  Overdue
                </span>
              ) : (
                <span key="t" />
              ),
            ])}
          />
        ) : null}
      </DashSection>
    </ManageChrome>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'green' | 'blue' | 'red'
}) {
  const toneClass = {
    green: 'text-green-700',
    blue: 'text-blue-700',
    red: 'text-red-700',
  }[tone]
  return (
    <div className="flex min-w-[9rem] flex-1 items-baseline justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:max-w-[16rem]">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

function DashSection({
  title,
  count,
  tone,
  empty,
  hint,
  children,
}: {
  title: string
  count: number
  tone: 'red' | 'amber' | 'slate' | 'gray'
  empty: string
  hint?: string
  children?: React.ReactNode
}) {
  const dot = {
    red: 'bg-red-600',
    amber: 'bg-amber-500',
    slate: 'bg-slate-500',
    gray: 'bg-gray-400',
  }[tone]
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
        <h2 className="text-lg font-bold text-gray-950">{title}</h2>
        <span className="text-sm font-semibold text-gray-400 tabular-nums">{count}</span>
      </div>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
      <div className="mt-3">
        {count > 0 ? children : <p className="text-sm text-gray-500">{empty}</p>}
      </div>
    </section>
  )
}

function Rows({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((cells, i) => (
            <tr key={i} className="align-middle">
              {cells.map((cell, j) => (
                <td key={j} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MachineCell({ code, name }: { code: string; name: string }) {
  return (
    <span className="flex flex-col">
      <span className="font-semibold text-gray-950">{name}</span>
      <span className="font-mono text-xs text-gray-500">{code}</span>
    </span>
  )
}

function HolderCell({ name, fmId }: { name: string; fmId: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-gray-800">{name}</span>
      <span className="font-mono text-xs text-gray-500">FM {fmId}</span>
    </span>
  )
}
