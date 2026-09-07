'use client'

import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'

import type { PrintLabel } from '@/lib/domain/types'

/**
 * QR label sheet. Selection (all / by location / individual) is on-screen only;
 * the printable area is #print-root. QR codes are generated in the browser at
 * error-correction level M (these get scuffed in a basement) and never stored.
 * The print stylesheet hides all app chrome and lays the labels out 3-across on
 * A4 with dashed cut guides.
 */
type Mode = 'all' | 'location' | 'pick'

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 10mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #print-root, #print-root * { visibility: visible !important; }
  #print-root { position: absolute; left: 0; top: 0; width: 100%; }
  .screen-only { display: none !important; }
  .qr-label { break-inside: avoid; }
}
`

export function PrintSheet({
  orgSlug,
  origin,
  machines,
  locations,
}: {
  orgSlug: string
  origin: string
  machines: PrintLabel[]
  locations: { id: string; name: string }[]
}) {
  const [mode, setMode] = useState<Mode>('all')
  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? '')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [svgs, setSvgs] = useState<Record<string, string>>({})

  const urlFor = (slug: string) => `${origin}/${orgSlug}/m/${slug}`

  const selected = useMemo(() => {
    if (mode === 'all') return machines
    if (mode === 'location') return machines.filter((m) => m.locationId === locationId)
    return machines.filter((m) => picked.has(m.id))
  }, [mode, locationId, picked, machines])

  useEffect(() => {
    let cancelled = false
    const missing = selected.filter((m) => !(m.slug in svgs))
    if (missing.length === 0) return
    Promise.all(
      missing.map(async (m) => {
        const svg = await QRCode.toString(urlFor(m.slug), {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 1,
        })
        return [m.slug, svg] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      setSvgs((prev) => {
        const next = { ...prev }
        for (const [slug, svg] of pairs) next[slug] = svg
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [selected, svgs, origin, orgSlug])

  return (
    <div>
      <div className="screen-only flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <fieldset className="flex flex-wrap items-center gap-3 text-sm">
            <legend className="sr-only">Which machines</legend>
            <label className="flex items-center gap-1.5 font-medium text-gray-700">
              <input type="radio" name="mode" checked={mode === 'all'} onChange={() => setMode('all')} />
              All active ({machines.length})
            </label>
            <label className="flex items-center gap-1.5 font-medium text-gray-700">
              <input type="radio" name="mode" checked={mode === 'location'} onChange={() => setMode('location')} />
              By location
            </label>
            <label className="flex items-center gap-1.5 font-medium text-gray-700">
              <input type="radio" name="mode" checked={mode === 'pick'} onChange={() => setMode('pick')} />
              Pick individually
            </label>
          </fieldset>

          {mode === 'location' ? (
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-900"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            onClick={() => window.print()}
            disabled={selected.length === 0}
            className="ml-auto rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            Print {selected.length} label{selected.length === 1 ? '' : 's'}
          </button>
        </div>

        {mode === 'pick' ? (
          <div className="grid gap-1 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 md:grid-cols-3">
            {machines.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={picked.has(m.id)}
                  onChange={(e) => {
                    setPicked((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(m.id)
                      else next.delete(m.id)
                      return next
                    })
                  }}
                />
                <span className="font-mono text-xs">{m.code}</span>
                <span className="truncate">{m.name}</span>
              </label>
            ))}
          </div>
        ) : null}

        <p className="text-sm text-gray-500">
          Preview below is what prints. {selected.length === 0 ? 'Select at least one machine.' : null}
        </p>
      </div>

      <style>{PRINT_CSS}</style>

      <div
        id="print-root"
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
        style={{ gridAutoRows: '1fr' }}
      >
        {selected.map((m) => (
          <div
            key={m.id}
            className="qr-label flex flex-col items-center gap-2 border border-dashed border-gray-400 p-3 text-center"
          >
            <div className="text-lg font-bold leading-tight text-black">{m.name}</div>
            <div className="font-mono text-sm text-black">{m.code}</div>
            <div
              className="h-40 w-40"
              // QRCode.toString(svg) output — a static, self-contained <svg>.
              dangerouslySetInnerHTML={{ __html: svgs[m.slug] ?? '' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
