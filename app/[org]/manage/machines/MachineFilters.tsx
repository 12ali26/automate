'use client'

import { useRouter } from 'next/navigation'

/**
 * Status + location filters for the machines list. Filtering is a navigation:
 * it rewrites the query string so the page (a server component) re-queries and
 * the result is shareable / bookmarkable. Changing a filter resets to page 1.
 */
export function MachineFilters({
  orgSlug,
  status,
  location,
  locations,
}: {
  orgSlug: string
  status: string
  location: string
  locations: { id: string; name: string }[]
}) {
  const router = useRouter()

  const go = (next: { status?: string; location?: string }) => {
    const p = new URLSearchParams()
    const s = next.status ?? status
    const l = next.location ?? location
    if (s) p.set('status', s)
    if (l) p.set('location', l)
    const qs = p.toString()
    router.push(`/${orgSlug}/manage/machines${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        Status
        <select
          value={status}
          onChange={(e) => go({ status: e.target.value })}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-900"
        >
          <option value="">All</option>
          <option value="available">Available</option>
          <option value="checked_out">Checked out</option>
          <option value="faulty">Faulty</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        Location
        <select
          value={location}
          onChange={(e) => go({ location: e.target.value })}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-900"
        >
          <option value="">All</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {status || location ? (
        <button
          type="button"
          onClick={() => router.push(`/${orgSlug}/manage/machines`)}
          className="text-sm font-semibold text-gray-500 underline hover:text-gray-800"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}
