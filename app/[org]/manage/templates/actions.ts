'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireManagerForAction } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as checklistsRepo from '@/lib/repos/checklists'
import { templateCreateSchema, templateSaveSchema } from '@/lib/validation/template'

export type TemplateActionState = { error?: string; ok?: boolean }

export type SaveTemplateActionResult =
  | { ok: true; items: { id: string; label: string; blocking: boolean }[] }
  | { ok: false; error: string }

export async function createTemplateAction(
  orgSlug: string,
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const { orgId, employeeId } = await requireManagerForAction(orgSlug)

  const parsed = templateCreateSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a template name.' }
  }

  const { id } = await withOrgContext(orgId, (tx) =>
    checklistsRepo.createTemplate(tx, { name: parsed.data.name, actorEmployeeId: employeeId }),
  )
  revalidatePath(`/${orgSlug}/manage/templates`)
  redirect(`/${orgSlug}/manage/templates/${id}`)
}

export async function saveTemplateAction(
  orgSlug: string,
  templateId: string,
  payload: unknown,
): Promise<SaveTemplateActionResult> {
  const { orgId, employeeId } = await requireManagerForAction(orgSlug)

  const parsed = templateSaveSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the checklist and try again.',
    }
  }

  const res = await withOrgContext(orgId, (tx) =>
    checklistsRepo.save(tx, templateId, {
      name: parsed.data.name,
      active: parsed.data.active,
      items: parsed.data.items,
      actorEmployeeId: employeeId,
    }),
  )
  if (!res.ok) return { ok: false, error: 'That template no longer exists.' }

  revalidatePath(`/${orgSlug}/manage/templates`)
  revalidatePath(`/${orgSlug}/manage/templates/${templateId}`)
  return {
    ok: true,
    items: res.items.map((it) => ({ id: it.id, label: it.label, blocking: it.blocking })),
  }
}
