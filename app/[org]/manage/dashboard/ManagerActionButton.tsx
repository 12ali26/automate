'use client'

import { useState, useTransition } from 'react'

import type { ManagerActionResult } from './actions'

/**
 * A single manager action (Clear fault / Resolve). Calls the server action,
 * shows an inline error if it comes back rejected; on success the action
 * revalidates the dashboard and the row disappears on the next render.
 */
export function ManagerActionButton({
  label,
  pendingLabel,
  action,
}: {
  label: string
  pendingLabel: string
  action: () => Promise<ManagerActionResult>
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const res = await action()
            if (res && !res.ok) setError(res.message)
          })
        }}
        className="shrink-0 rounded-md bg-gray-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  )
}
