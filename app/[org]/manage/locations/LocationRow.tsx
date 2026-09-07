'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'

import { InactiveTag, SubmitButton } from '@/components/manage/ui'
import type { ManageLocationRow } from '@/lib/domain/types'

import {
  deleteLocationAction,
  updateLocationAction,
  type LocationActionState,
} from './actions'

/**
 * One locations-table row. Read-only until "Edit" opens an inline form. Delete
 * is refused server-side when machines/history reference the location, or when
 * it is the last active store — the button is pre-disabled for the obvious
 * cases and the server message is shown for the rest.
 */
export function LocationRow({
  orgSlug,
  location,
  isLastActiveStore,
}: {
  orgSlug: string
  location: ManageLocationRow
  isLastActiveStore: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [state, formAction] = useActionState<LocationActionState, FormData>(
    updateLocationAction.bind(null, orgSlug, location.id),
    {},
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  // The server revalidates the page on a successful save; close the editor.
  useEffect(() => {
    if (state.ok) setEditing(false)
  }, [state])

  const deleteDisabled = location.machineCount > 0 || isLastActiveStore

  if (editing) {
    return (
      <tr className="align-top">
        <td colSpan={5} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Name
              <input
                name="name"
                defaultValue={location.name}
                required
                maxLength={80}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Type
              <select
                name="type"
                defaultValue={location.type}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-900"
              >
                <option value="store">Store</option>
                <option value="housekeeping">Housekeeping</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" name="active" defaultChecked={location.active} />
              Active
            </label>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm font-semibold text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
            {state.error ? (
              <span role="alert" className="w-full text-xs text-red-600">
                {state.error}
              </span>
            ) : null}
          </form>
        </td>
      </tr>
    )
  }

  return (
    <tr className="align-middle">
      <td className="px-4 py-3 font-semibold text-gray-950">{location.name}</td>
      <td className="px-4 py-3 capitalize text-gray-700">{location.type}</td>
      <td className="px-4 py-3 tabular-nums text-gray-700">{location.machineCount}</td>
      <td className="px-4 py-3">{location.active ? <span className="text-sm text-green-700">Active</span> : <InactiveTag />}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-gray-700 underline hover:text-gray-950"
          >
            Edit
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setDeleteError(null)
                  startTransition(async () => {
                    const res = await deleteLocationAction(orgSlug, location.id)
                    if (!res.ok) {
                      setDeleteError(res.message)
                      setConfirming(false)
                    }
                  })
                }}
                className="text-sm font-semibold text-red-700 underline hover:text-red-800 disabled:opacity-40"
              >
                {pending ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={deleteDisabled}
              title={
                location.machineCount > 0
                  ? 'Machines reference this location — deactivate it instead'
                  : isLastActiveStore
                    ? "The facility's only active store cannot be deleted"
                    : undefined
              }
              onClick={() => setConfirming(true)}
              className="text-sm font-semibold text-red-700 underline hover:text-red-800 disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
            >
              Delete
            </button>
          )}
        </div>
        {deleteError ? (
          <p role="alert" className="mt-1 text-right text-xs text-red-600">
            {deleteError}
          </p>
        ) : null}
      </td>
    </tr>
  )
}
