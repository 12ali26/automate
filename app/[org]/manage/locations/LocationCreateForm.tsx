'use client'

import { useActionState, useEffect, useRef } from 'react'

import { Callout, SubmitButton } from '@/components/manage/ui'

import { createLocationAction, type LocationActionState } from './actions'

export function LocationCreateForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction] = useActionState<LocationActionState, FormData>(
    createLocationAction.bind(null, orgSlug),
    {},
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-gray-700">
        Name
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Basement Store"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        Type
        <select
          name="type"
          defaultValue="store"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-base outline-none focus:border-gray-900"
        >
          <option value="store">Store</option>
          <option value="housekeeping">Housekeeping</option>
        </select>
      </label>
      <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      {state.error ? (
        <div className="w-full">
          <Callout tone="error">{state.error}</Callout>
        </div>
      ) : null}
    </form>
  )
}
