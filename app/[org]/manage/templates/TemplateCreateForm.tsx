'use client'

import { useActionState } from 'react'

import { Callout, SubmitButton } from '@/components/manage/ui'

import { createTemplateAction, type TemplateActionState } from './actions'

export function TemplateCreateForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction] = useActionState<TemplateActionState, FormData>(
    createTemplateAction.bind(null, orgSlug),
    {},
  )

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-gray-700">
        Name
        <input
          name="name"
          required
          maxLength={120}
          placeholder="Vacuum check"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-900"
        />
      </label>
      <SubmitButton pendingLabel="Creating…">Create &amp; edit items</SubmitButton>
      {state.error ? (
        <div className="w-full">
          <Callout tone="error">{state.error}</Callout>
        </div>
      ) : null}
    </form>
  )
}
