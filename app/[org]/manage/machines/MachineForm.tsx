'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Callout, CheckboxField, Field, SelectField, SubmitButton } from '@/components/manage/ui'

import { createMachineAction, updateMachineAction, type MachineFormState } from './actions'

type Option = { value: string; label: string }

/**
 * Create / edit form for a machine. The slug is never a field here — it is
 * generated on create and only ever changed through the explicit "regenerate"
 * action on the detail screen.
 */
export function MachineForm({
  orgSlug,
  machineId,
  defaults,
  templates,
  locations,
}: {
  orgSlug: string
  machineId?: string
  defaults?: { code: string; name: string; templateId: string | null; locationId: string | null; active: boolean }
  templates: Option[]
  locations: Option[]
}) {
  const isEdit = machineId != null
  const action = isEdit
    ? updateMachineAction.bind(null, orgSlug, machineId)
    : createMachineAction.bind(null, orgSlug)
  const [state, formAction] = useActionState<MachineFormState, FormData>(action, {})

  const codeError = state.fieldError?.field === 'code' ? state.fieldError.message : undefined

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {state.error && !codeError ? <Callout tone="error">{state.error}</Callout> : null}

      <Field
        label="Code"
        name="code"
        defaultValue={defaults?.code}
        required
        autoFocus={!isEdit}
        placeholder="FM-SD-003"
        hint="The human identifier said out loud. Letters, digits and hyphens. Unique within this facility."
        error={codeError}
      />
      <Field
        label="Name"
        name="name"
        defaultValue={defaults?.name}
        required
        placeholder="Corridor vacuum 3"
      />
      <SelectField
        label="Current location"
        name="locationId"
        defaultValue={defaults?.locationId ?? ''}
        placeholder="— none —"
        options={locations}
      />
      <SelectField
        label="Checklist template"
        name="templateId"
        defaultValue={defaults?.templateId ?? ''}
        placeholder="— none —"
        options={templates}
      />

      {isEdit ? (
        <CheckboxField
          label="Active"
          name="active"
          defaultChecked={defaults?.active ?? true}
          hint="An inactive machine is hidden from the fleet view and cannot be checked out. Its history is kept. A checked-out machine cannot be deactivated."
        />
      ) : null}

      <div className="mt-2 flex items-center gap-3">
        <SubmitButton pendingLabel={isEdit ? 'Saving…' : 'Creating…'}>
          {isEdit ? 'Save changes' : 'Create machine'}
        </SubmitButton>
        <Link
          href={`/${orgSlug}/manage/machines`}
          className="text-sm font-semibold text-gray-500 hover:text-gray-800"
        >
          {isEdit ? 'Back to list' : 'Cancel'}
        </Link>
        {isEdit && state.ok ? <span className="text-sm text-green-700">Saved.</span> : null}
      </div>
    </form>
  )
}
