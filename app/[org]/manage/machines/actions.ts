'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { z } from 'zod'

import { requireManagerForAction } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as machinesRepo from '@/lib/repos/machines'
import { machineCreateSchema, machineEditSchema } from '@/lib/validation/machine'

/**
 * Machine admin actions. The route already required a manager session for this
 * org (layer one); machinesRepo re-reads nothing about role here because create
 * / update are manager-only surfaces reached only through the guarded actions —
 * the repo functions still take the acting employee id for the activity log.
 */
export type MachineFormState = {
  error?: string
  fieldError?: { field: string; message: string }
  ok?: boolean
}

function firstIssue(error: z.ZodError): MachineFormState {
  const issue = error.issues[0]
  const field = issue?.path[0]
  return {
    error: issue?.message ?? 'Check the form and try again.',
    fieldError: field ? { field: String(field), message: issue?.message ?? '' } : undefined,
  }
}

export async function createMachineAction(
  orgSlug: string,
  _prev: MachineFormState,
  formData: FormData,
): Promise<MachineFormState> {
  const { orgId, employeeId } = await requireManagerForAction(orgSlug)

  const parsed = machineCreateSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    templateId: formData.get('templateId') ?? '',
    locationId: formData.get('locationId') ?? '',
  })
  if (!parsed.success) return firstIssue(parsed.error)

  const res = await withOrgContext(orgId, (tx) =>
    machinesRepo.create(tx, {
      code: parsed.data.code,
      name: parsed.data.name,
      templateId: parsed.data.templateId,
      locationId: parsed.data.locationId,
      actorEmployeeId: employeeId,
    }),
  )
  if (!res.ok) {
    return {
      error: `A machine with the code ${parsed.data.code} already exists in this facility.`,
      fieldError: { field: 'code', message: 'That code is already in use.' },
    }
  }

  revalidatePath(`/${orgSlug}/manage/machines`)
  redirect(`/${orgSlug}/manage/machines/${res.id}`)
}

export async function updateMachineAction(
  orgSlug: string,
  machineId: string,
  _prev: MachineFormState,
  formData: FormData,
): Promise<MachineFormState> {
  const { orgId, employeeId } = await requireManagerForAction(orgSlug)

  const parsed = machineEditSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    templateId: formData.get('templateId') ?? '',
    locationId: formData.get('locationId') ?? '',
    active: formData.get('active') === 'on',
  })
  if (!parsed.success) return firstIssue(parsed.error)

  const res = await withOrgContext(orgId, (tx) =>
    machinesRepo.update(tx, machineId, {
      code: parsed.data.code,
      name: parsed.data.name,
      templateId: parsed.data.templateId,
      locationId: parsed.data.locationId,
      active: parsed.data.active,
      actorEmployeeId: employeeId,
    }),
  )
  if (!res.ok) {
    const message =
      res.reason === 'duplicate-code'
        ? `That code is already used by another machine in this facility.`
        : res.reason === 'checked-out'
          ? `This machine is checked out. Get it back before deactivating it.`
          : `That machine no longer exists.`
    return {
      error: message,
      fieldError: res.reason === 'duplicate-code' ? { field: 'code', message } : undefined,
    }
  }

  revalidatePath(`/${orgSlug}/manage/machines`)
  revalidatePath(`/${orgSlug}/manage/machines/${machineId}`)
  return { ok: true }
}

export type RegenerateResult = { ok: true; slug: string } | { ok: false; message: string }

export async function regenerateMachineSlugAction(
  orgSlug: string,
  machineId: string,
): Promise<RegenerateResult> {
  const { orgId } = await requireManagerForAction(orgSlug)
  const slug = await withOrgContext(orgId, (tx) => machinesRepo.regenerateSlug(tx, machineId))
  if (!slug) return { ok: false, message: 'That machine no longer exists.' }
  revalidatePath(`/${orgSlug}/manage/machines/${machineId}`)
  return { ok: true, slug }
}
