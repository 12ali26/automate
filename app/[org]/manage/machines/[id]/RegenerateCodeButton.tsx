'use client'

import { useState, useTransition } from 'react'

import { regenerateMachineSlugAction } from '../actions'

/**
 * Two-step confirm for regenerating a machine's QR slug. The first click only
 * reveals the warning and the confirm button — the destructive call needs a
 * deliberate second click, because the moment it runs every printed sticker for
 * this machine is dead.
 */
export function RegenerateCodeButton({
  orgSlug,
  machineId,
}: {
  orgSlug: string
  machineId: string
}) {
  const [armed, setArmed] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p className="text-sm text-green-700">
        New sticker code generated. Print a fresh label from{' '}
        <a href={`/${orgSlug}/manage/machines/print`} className="underline">
          Print labels
        </a>
        . The previous sticker no longer resolves.
      </p>
    )
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Regenerate code
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-red-700">
        This immediately invalidates the current sticker. A replacement must be printed and
        fitted before anyone can scan this machine again. Continue?
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const res = await regenerateMachineSlugAction(orgSlug, machineId)
              if (res.ok) setDone(res.slug)
              else setError(res.message)
            })
          }}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
        >
          {pending ? 'Regenerating…' : 'Yes, regenerate'}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="text-sm font-semibold text-gray-500 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  )
}
