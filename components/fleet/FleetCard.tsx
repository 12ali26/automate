import Link from 'next/link'

import { formatDuration } from '@/lib/domain/duration'
import type { FleetMachine } from '@/lib/domain/types'

/**
 * One compact machine card in the fleet view. Tapping it opens the machine
 * page, where the machine can be claimed.
 *
 * - available: loud. Solid green-edged card, dark text. A housekeeping location
 *   gets an amber marker so a scattered machine is visible at a glance.
 * - faulty: muted red, with a short reason.
 * - checked out: muted grey, holder name + how long it's been out.
 */
export function FleetCard({
  orgSlug,
  machine,
}: {
  orgSlug: string
  machine: FleetMachine
}) {
  const href = `/${orgSlug}/m/${machine.code}`
  const offStore = machine.currentLocation && machine.currentLocation.type !== 'store'

  if (machine.status === 'available') {
    return (
      <Link
        href={href}
        className="flex flex-col gap-1 rounded-xl border-2 border-emerald-600 bg-white p-3 active:bg-emerald-50"
      >
        <span className="flex items-center gap-3">
          <span className="flex-1 min-w-0 truncate text-lg font-bold text-gray-950">
            {machine.name}
          </span>
          <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            Available
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{machine.code}</span>
          {offStore ? (
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">
              <span aria-hidden>▲ </span>
              {machine.currentLocation!.name}
            </span>
          ) : null}
        </span>
      </Link>
    )
  }

  if (machine.status === 'faulty') {
    return (
      <Link
        href={href}
        className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-3 active:bg-red-50"
      >
        <span className="flex-1 min-w-0">
          <span className="block truncate text-base font-semibold text-red-950">{machine.name}</span>
          <span className="block font-mono text-xs text-red-400">{machine.code}</span>
          {machine.openIncident?.description ? (
            <span className="mt-1 block truncate text-sm text-red-700">
              {machine.openIncident.description}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Faulty
        </span>
      </Link>
    )
  }

  // checked_out
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-500 active:bg-gray-100"
    >
      <span className="flex-1 min-w-0">
        <span className="block truncate text-base font-semibold text-gray-700">{machine.name}</span>
        <span className="block font-mono text-xs text-gray-400">{machine.code}</span>
      </span>
      <span className="shrink-0 text-right text-sm">
        <span className="block text-gray-700">{machine.holder?.fullName ?? 'someone'}</span>
        {machine.holder ? (
          <span className="block text-xs text-gray-500">{formatDuration(machine.holder.since)}</span>
        ) : null}
      </span>
    </Link>
  )
}
