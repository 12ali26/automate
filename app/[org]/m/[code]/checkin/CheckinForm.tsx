'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import type { Location } from '@/lib/domain/types'
import { checkInAction } from '@/lib/machine/actions'
import type { CheckInFailure } from '@/lib/machine/checkin'

const FAILURE_MESSAGE: Record<CheckInFailure, string> = {
  'not-yours': 'This machine is no longer checked out to you.',
  'not-found': 'This machine is no longer available.',
  invalid: 'Something went wrong with that submission. Please try again.',
}

export function CheckinForm({
  orgSlug,
  code,
  locations,
  defaultLocationId,
  backHref,
}: {
  orgSlug: string
  code: string
  locations: Location[]
  defaultLocationId: string
  backHref: string
}) {
  const [locationId, setLocationId] = useState(defaultLocationId)
  const [faultOpen, setFaultOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [failure, setFailure] = useState<CheckInFailure | null>(null)
  const [pending, startTransition] = useTransition()

  const faultInvalid = faultOpen && description.trim().length === 0
  const canSubmit = locationId.length > 0 && !faultInvalid && !pending

  function submit() {
    if (!canSubmit) return
    setFailure(null)
    startTransition(async () => {
      const result = await checkInAction(orgSlug, code, {
        returnLocationId: locationId,
        faultReported: faultOpen,
        faultDescription: faultOpen ? description.trim() : null,
      })
      // A successful check-in redirects server-side; only failures return here.
      if (result && !result.ok) setFailure(result.reason)
    })
  }

  return (
    <form
      className="flex flex-1 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-lg font-semibold text-gray-950">
          Where is it being returned?
        </legend>
        <div className="flex flex-col gap-2">
          {locations.map((loc) => {
            const selected = locationId === loc.id
            const housekeeping = loc.type !== 'store'
            const ring = selected
              ? housekeeping
                ? 'border-amber-500 bg-amber-50'
                : 'border-gray-950 bg-gray-50'
              : 'border-gray-300 bg-white active:bg-gray-100'
            return (
              <label
                key={loc.id}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 ${ring}`}
              >
                <input
                  type="radio"
                  name="returnLocation"
                  value={loc.id}
                  checked={selected}
                  onChange={() => setLocationId(loc.id)}
                  className="h-5 w-5"
                />
                <span className="flex-1 text-lg font-semibold text-gray-950">
                  {loc.name}
                </span>
                {housekeeping ? (
                  <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">
                    <span aria-hidden>▲ </span>Housekeeping
                  </span>
                ) : null}
              </label>
            )
          })}
        </div>
        {locationId && locations.find((l) => l.id === locationId)?.type !== 'store' ? (
          <p className="text-sm font-medium text-amber-800">
            Returning to a housekeeping area — the store is the usual spot.
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-gray-300 px-4">
          <input
            type="checkbox"
            checked={faultOpen}
            onChange={(e) => setFaultOpen(e.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-lg font-semibold text-gray-950">
            Something&rsquo;s wrong with it
          </span>
        </label>
        {faultOpen ? (
          <textarea
            autoFocus
            rows={4}
            placeholder="What’s wrong? This raises a fault and takes the machine out of service."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={faultInvalid}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-900"
          />
        ) : null}
        {faultInvalid ? (
          <p role="alert" className="text-sm text-red-600">
            Describe what is wrong with the machine.
          </p>
        ) : null}
      </div>

      <div className="flex-1" />

      {failure ? (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-600 bg-red-50 p-4 text-base font-semibold text-red-950"
        >
          <p>{FAILURE_MESSAGE[failure]}</p>
          <Link href={backHref} className="mt-2 inline-block font-bold underline">
            Back to machine
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 pb-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full min-h-14 rounded-xl bg-gray-950 px-6 text-center text-xl font-bold text-white active:bg-gray-800 disabled:opacity-40"
        >
          {pending ? 'Checking in…' : faultOpen ? 'Check in and report fault' : 'Confirm check in'}
        </button>
        <Link
          href={backHref}
          className="w-full min-h-11 rounded-lg px-4 py-2 text-center text-base font-semibold text-gray-600 active:bg-gray-100"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
