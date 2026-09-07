import Link from 'next/link'

import { formatDuration } from '@/lib/domain/duration'
import type { FleetMachine } from '@/lib/domain/types'

/**
 * One compact machine card in the fleet view.
 *
 * The fleet view is information only. The card itself is a plain, non-
 * interactive element — no link, no long-press, no "view details". Operators
 * reach machine actions only by scanning a sticker.
 *
 * The ONE sanctioned action here is "Not here?" on an available machine: the
 * machine isn't there to scan, so reporting it can't require a scan. It is a
 * small, quiet link — deliberately not styled as a card link.
 *
 * Three flags, kept visually distinct:
 *   amber  = at a housekeeping location (informational)
 *   red    = faulty (blocked)
 *   slate  = reported missing (needs investigation)
 */
export function FleetCard({
  machine,
  orgSlug,
}: {
  machine: FleetMachine
  orgSlug: string
}) {
  const offStore = machine.currentLocation && machine.currentLocation.type !== 'store'
  const missing = machine.openDiscrepancy !== null
  const faulty = machine.status === 'faulty' || machine.openIncident !== null

  // Held (open checkout) — with a person, not at a location. May also be faulty.
  if (machine.holder) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-500">
        <span className="flex-1 min-w-0">
          <span className="block truncate text-base font-semibold text-gray-700">{machine.name}</span>
          <span className="block font-mono text-xs text-gray-400">{machine.code}</span>
          {faulty || missing ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {faulty ? <FaultyChip /> : null}
              {missing ? <MissingChip /> : null}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right text-sm">
          <span className="block text-gray-700">{machine.holder.fullName || 'someone'}</span>
          <span className="block text-xs text-gray-500">
            {formatDuration(machine.holder.since)}
          </span>
        </span>
      </div>
    )
  }

  if (machine.status === 'faulty') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
        <span className="flex-1 min-w-0">
          <span className="block truncate text-base font-semibold text-red-950">{machine.name}</span>
          <span className="block font-mono text-xs text-red-400">{machine.code}</span>
          {machine.openIncident?.description ? (
            <span className="mt-1 block truncate text-sm text-red-700">
              {machine.openIncident.description}
            </span>
          ) : null}
          {missing ? <span className="mt-1 flex"><MissingChip /></span> : null}
        </span>
        <span className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Faulty
        </span>
      </div>
    )
  }

  // available
  return (
    <div className="flex flex-col gap-1 rounded-xl border-2 border-emerald-600 bg-white p-3">
      <span className="flex items-center gap-3">
        <span className="flex-1 min-w-0 truncate text-lg font-bold text-gray-950">
          {machine.name}
        </span>
        <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Available
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-gray-500">{machine.code}</span>
        {offStore ? (
          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">
            <span aria-hidden>▲ </span>
            {machine.currentLocation!.name}
          </span>
        ) : null}
        {missing ? <MissingChip /> : null}
      </span>
      {!missing ? (
        <span className="mt-0.5">
          <Link
            href={`/${orgSlug}/missing/${machine.slug}`}
            className="text-xs font-medium text-slate-500 underline underline-offset-2 active:text-slate-700"
          >
            Not here?
          </Link>
        </span>
      ) : null}
    </div>
  )
}

function FaultyChip() {
  return (
    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
      Faulty
    </span>
  )
}

function MissingChip() {
  return (
    <span className="rounded border border-dashed border-slate-500 bg-slate-100 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-700">
      Reported missing
    </span>
  )
}
