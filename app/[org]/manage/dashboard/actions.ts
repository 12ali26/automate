'use server'

import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'

import { getManagerSession } from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import * as discrepanciesRepo from '@/lib/repos/discrepancies'
import * as incidentsRepo from '@/lib/repos/incidents'
import { findBySlug } from '@/lib/repos/orgs'

/**
 * Dashboard actions. The route guard (a valid manager session for this org) is
 * layer one; the repo functions re-check the acting employee's role is
 * 'manager' as layer two. Both, not one.
 */

export type ManagerActionResult = { ok: true } | { ok: false; message: string }

async function managerFor(orgSlug: string) {
  const org = await findBySlug(orgSlug)
  if (!org) notFound()
  const session = await getManagerSession(org.id)
  if (!session) redirect(`/${orgSlug}/manage`)
  return { orgId: org.id, employeeId: session.employeeId }
}

const CLEAR_MESSAGE: Record<string, string> = {
  'not-manager': 'Only a manager can clear a fault.',
  'not-found': 'That fault no longer exists.',
  'not-open': 'That fault has already been cleared.',
}

const RESOLVE_MESSAGE: Record<string, string> = {
  'not-manager': 'Only a manager can resolve a discrepancy.',
  'not-found': 'That report no longer exists.',
  'not-open': 'That report has already been resolved.',
}

export async function clearFaultAction(
  orgSlug: string,
  incidentId: string,
): Promise<ManagerActionResult> {
  const { orgId, employeeId } = await managerFor(orgSlug)
  const res = await withOrgContext(orgId, (tx) =>
    incidentsRepo.clear(tx, incidentId, employeeId),
  )
  if (!res.ok) return { ok: false, message: CLEAR_MESSAGE[res.reason] ?? 'Could not clear that fault.' }
  revalidatePath(`/${orgSlug}/manage/dashboard`)
  return { ok: true }
}

export async function resolveDiscrepancyAction(
  orgSlug: string,
  discrepancyId: string,
): Promise<ManagerActionResult> {
  const { orgId, employeeId } = await managerFor(orgSlug)
  const res = await withOrgContext(orgId, (tx) =>
    discrepanciesRepo.resolve(tx, discrepancyId, employeeId),
  )
  if (!res.ok)
    return { ok: false, message: RESOLVE_MESSAGE[res.reason] ?? 'Could not resolve that report.' }
  revalidatePath(`/${orgSlug}/manage/dashboard`)
  return { ok: true }
}
