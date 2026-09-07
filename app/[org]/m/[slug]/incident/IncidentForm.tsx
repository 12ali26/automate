'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { reportFaultAction } from '@/lib/machine/actions'
import type { ReportFaultFailure } from '@/lib/machine/incident'

const FAILURE_MESSAGE: Record<ReportFaultFailure, string> = {
  'already-faulty': 'A fault has already been reported on this machine.',
  'not-yours': 'Someone else has this machine checked out — they report it.',
  'not-found': 'This machine is no longer available.',
  invalid: 'Please describe what is wrong before submitting.',
}

export function IncidentForm({
  orgSlug,
  slug,
  backHref,
}: {
  orgSlug: string
  slug: string
  backHref: string
}) {
  const [description, setDescription] = useState('')
  const [failure, setFailure] = useState<ReportFaultFailure | null>(null)
  const [pending, startTransition] = useTransition()

  const canSubmit = description.trim().length > 0 && !pending

  function submit() {
    if (!canSubmit) return
    setFailure(null)
    startTransition(async () => {
      const result = await reportFaultAction(orgSlug, slug, { description: description.trim() })
      // Success redirects server-side; only failures return here.
      if (result && !result.ok) setFailure(result.reason)
    })
  }

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label htmlFor="description" className="text-lg font-semibold text-gray-950">
        What&rsquo;s wrong with it?
      </label>
      <textarea
        id="description"
        autoFocus
        rows={6}
        placeholder="Describe the problem in your own words."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base outline-none focus:border-gray-900"
      />
      <p className="text-sm text-gray-600">
        This takes the machine out of service until a manager clears it. It does not check the
        machine in — if you&rsquo;re holding it, you still need to return it.
      </p>

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
          {pending ? 'Reporting…' : 'Report fault'}
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
