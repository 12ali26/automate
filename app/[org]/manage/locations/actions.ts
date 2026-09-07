'use server'

import { revalidatePath } from 'next/cache'

import { requireManagerForAction } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as locationsRepo from '@/lib/repos/locations'
import { locationCreateSchema, locationEditSchema } from '@/lib/validation/location'

export type LocationActionState = { error?: string; ok?: boolean }

const bust = (orgSlug: string) => {
  revalidatePath(`/${orgSlug}/manage/locations`)
}

export async function createLocationAction(
  orgSlug: string,
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const { orgId, employeeId } = await requireManagerForAction(orgSlug)

  const parsed = locationCreateSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const res = await withOrgContext(orgId, (tx) =>
    locationsRepo.create(tx, {
      name: parsed.data.name,
      type: parsed.data.type,
      actorEmployeeId: employeeId,
    }),
  )
  if (!res.ok) {
    return { error: `A location named "${parsed.data.name}" already exists.` }
  }
  bust(orgSlug)
  return { ok: true }
}

export async function updateLocationAction(
  orgSlug: string,
  locationId: string,
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const { orgId, employeeId } = await requireManagerForAction(orgSlug)

  const parsed = locationEditSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    active: formData.get('active') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const res = await withOrgContext(orgId, (tx) =>
    locationsRepo.update(tx, locationId, {
      name: parsed.data.name,
      type: parsed.data.type,
      active: parsed.data.active,
      actorEmployeeId: employeeId,
    }),
  )
  if (!res.ok) {
    const message =
      res.reason === 'duplicate-name'
        ? `A location named "${parsed.data.name}" already exists.`
        : res.reason === 'last-store'
          ? `This is the facility's only active store. Add another store before changing this one.`
          : `That location no longer exists.`
    return { error: message }
  }
  bust(orgSlug)
  return { ok: true }
}

export type DeleteLocationActionResult = { ok: true } | { ok: false; message: string }

export async function deleteLocationAction(
  orgSlug: string,
  locationId: string,
): Promise<DeleteLocationActionResult> {
  const { orgId, employeeId } = await requireManagerForAction(orgSlug)
  const res = await withOrgContext(orgId, (tx) =>
    locationsRepo.remove(tx, locationId, employeeId),
  )
  if (!res.ok) {
    const message =
      res.reason === 'in-use'
        ? `Machines or past records still reference this location. Deactivate it instead — its history stays intact.`
        : res.reason === 'last-store'
          ? `This is the facility's only active store and cannot be deleted.`
          : `That location no longer exists.`
    return { ok: false, message }
  }
  bust(orgSlug)
  return { ok: true }
}
