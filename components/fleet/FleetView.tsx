'use client'

import { useEffect, useMemo, useState } from 'react'

import { groupFleet, type FleetLocationGroup } from '@/lib/domain/fleet'
import type { FleetMachine } from '@/lib/domain/types'

import { FleetCard } from './FleetCard'
import { InstallPrompt } from './InstallPrompt'

const FILTER_KEY = 'automate:fleet:available-only'

export function FleetView({
  orgSlug,
  machines,
  flaggedMissing = false,
}: {
  orgSlug: string
  machines: FleetMachine[]
  flaggedMissing?: boolean
}) {
  const [availableOnly, setAvailableOnly] = useState(false)

  // Read the persisted choice after mount to avoid a hydration mismatch.
  useEffect(() => {
    try {
      if (localStorage.getItem(FILTER_KEY) === '1') setAvailableOnly(true)
    } catch {
      /* ignore */
    }
  }, [])

  function toggle() {
    setAvailableOnly((prev) => {
      const next = !prev
      try {
        localStorage.setItem(FILTER_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const grouped = useMemo(() => groupFleet(machines), [machines])
  const { locationGroups, unplacedAvailable, unplacedFaulty, out, totals } = grouped

  const nothingAvailable = totals.total > 0 && totals.available === 0

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">Fleet</h1>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={availableOnly}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            availableOnly
              ? 'bg-gray-950 text-white'
              : 'border border-gray-300 bg-white text-gray-700 active:bg-gray-100'
          }`}
        >
          Available only
        </button>
      </div>

      <InstallPrompt />

      {flaggedMissing ? (
        <p
          role="status"
          className="rounded-xl border border-slate-400 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-800"
        >
          Thanks — flagged as not in its expected spot. A supervisor will follow up.
        </p>
      ) : null}

      {totals.total === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500">
          No machines yet.
        </p>
      ) : null}

      {nothingAvailable ? (
        <p className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-base font-bold text-amber-950">
          Nothing is available right now
          {totals.faulty > 0 ? ` — ${totals.faulty} faulty` : ''}
          {totals.out > 0 ? `, ${totals.out} out with someone` : ''}.
        </p>
      ) : null}

      {locationGroups.map((group) => (
        <LocationGroupSection
          key={group.location.id}
          orgSlug={orgSlug}
          group={group}
          availableOnly={availableOnly}
        />
      ))}

      {unplacedAvailable.length > 0 || (!availableOnly && unplacedFaulty.length > 0) ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Location not recorded
          </h2>
          <div className="flex flex-col gap-2">
            {unplacedAvailable.map((m) => (
              <FleetCard key={m.id} machine={m} orgSlug={orgSlug} />
            ))}
            {!availableOnly &&
              unplacedFaulty.map((m) => (
                <FleetCard key={m.id} machine={m} orgSlug={orgSlug} />
              ))}
          </div>
        </section>
      ) : null}

      {!availableOnly && out.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Out with someone <span className="text-gray-400">({out.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {out.map((m) => (
              <FleetCard key={m.id} machine={m} orgSlug={orgSlug} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

function LocationGroupSection({
  orgSlug,
  group,
  availableOnly,
}: {
  orgSlug: string
  group: FleetLocationGroup
  availableOnly: boolean
}) {
  const { location, available, faulty, outCount } = group
  const housekeeping = location.type !== 'store'
  const muted = available.length === 0

  // In "available only" mode a group with nothing available disappears entirely.
  if (availableOnly && available.length === 0) return null

  const showFaulty = !availableOnly && faulty.length > 0
  const showOutLine = !availableOnly && outCount > 0
  const onlyCount = muted && !showFaulty // nothing to list — collapse to a line

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={`text-sm font-bold uppercase tracking-wide ${
            muted ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          {location.name}
        </span>
        {housekeeping ? (
          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">
            <span aria-hidden>▲ </span>Housekeeping
          </span>
        ) : null}
        {!muted ? (
          <span className="text-xs font-semibold text-emerald-700">
            {available.length} available
          </span>
        ) : null}
      </h2>

      {onlyCount ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          {outCount === 1
            ? '1 machine, checked out (last returned here)'
            : `${outCount} machines, all checked out (last returned here)`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {available.map((m) => (
            <FleetCard key={m.id} machine={m} orgSlug={orgSlug} />
          ))}
          {showFaulty
            ? faulty.map((m) => <FleetCard key={m.id} machine={m} orgSlug={orgSlug} />)
            : null}
          {showOutLine ? (
            <p className="px-1 text-xs text-gray-400">
              {outCount} more checked out (last returned here)
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
