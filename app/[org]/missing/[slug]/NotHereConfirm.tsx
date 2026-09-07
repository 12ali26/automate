'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { reportDiscrepancyAction } from '@/lib/machine/actions'
import type { ReportDiscrepancyFailure } from '@/lib/machine/discrepancy'

const FAILURE_MESSAGE: Record<ReportDiscrepancyFailure, string> = {
  'not-available': 'That machine is no longer available — nothing to report.',
  'already-reported': 'That machine has already been reported as not in place.',
  'not-found': 'That machine could not be found.',
}

/**
 * A confirmation, not a form. The fact is the report — no description field.
 * Worded as a fact about the machine, never about a person: the data links it
 * to whoever last had it; the reporter is not pointing a finger.
 */
export function NotHereConfirm({
  orgSlug,
  slug,
  machineName,
  locationName,
  fleetHref,
}: {
  orgSlug: string
  slug: string
  machineName: string
  locationName: string
  fleetHref: string
}) {
  const [failure, setFailure] = useState<ReportDiscrepancyFailure | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    if (pending) return
    setFailure(null)
    startTransition(async () => {
      const result = await reportDiscrepancyAction(orgSlug, slug)
      // Success redirects to the fleet; only failures return here.
      if (result && !result.ok) setFailure(result.reason)
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-xl font-semibold text-gray-950">
        Report that <span className="font-extrabold">{machineName}</span> is not at{' '}
        <span className="font-extrabold">{locationName}</span>?
      </p>
      <p className="text-base text-gray-600">
        This flags the machine for a supervisor to track down. It doesn&rsquo;t change the
        machine&rsquo;s status.
      </p>

      <div className="flex-1" />

      {failure ? (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-600 bg-red-50 p-4 text-base font-semibold text-red-950"
        >
          <p>{FAILURE_MESSAGE[failure]}</p>
          <Link href={fleetHref} className="mt-2 inline-block font-bold underline">
            Back to fleet
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 pb-1">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="w-full min-h-14 rounded-xl bg-gray-950 px-6 text-center text-xl font-bold text-white active:bg-gray-800 disabled:opacity-40"
        >
          {pending ? 'Reporting…' : 'Yes, report it'}
        </button>
        <Link
          href={fleetHref}
          className="w-full min-h-11 rounded-lg px-4 py-2 text-center text-base font-semibold text-gray-600 active:bg-gray-100"
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}
