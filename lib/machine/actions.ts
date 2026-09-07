'use server'

import { notFound, redirect } from 'next/navigation'

import { getStaffSession } from '@/lib/auth/session'
import { performCheckIn, type CheckInResult } from '@/lib/machine/checkin'
import { performCheckOut, type CheckOutResult } from '@/lib/machine/checkout'
import {
  performReportDiscrepancy,
  type ReportDiscrepancyResult,
} from '@/lib/machine/discrepancy'
import { performReportFault, type ReportFaultResult } from '@/lib/machine/incident'
import { findBySlug } from '@/lib/repos/orgs'
import { checkinSubmissionSchema } from '@/lib/validation/checkin'
import { checkoutSubmissionSchema } from '@/lib/validation/checkout'
import { incidentSubmissionSchema } from '@/lib/validation/incident'

/**
 * Request-facing wrappers around the checkout / check-in cores. They resolve
 * the org and staff session from the request, re-validate the raw client
 * payload, delegate the transaction to lib/machine/*, and on success redirect
 * back to the machine page with a one-shot confirmation flag. Typed failures
 * are returned for the client form to render in place.
 */

export async function checkOutAction(
  orgSlug: string,
  slug: string,
  payload: unknown,
): Promise<CheckOutResult> {
  const parsed = checkoutSubmissionSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, reason: 'invalid' }

  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const session = await getStaffSession(org.id)
  if (!session) redirect(`/${orgSlug}/id?next=${encodeURIComponent(`/${orgSlug}/m/${slug}/checkout`)}`)

  const result = await performCheckOut({
    orgId: org.id,
    employeeId: session.employeeId,
    slug,
    responses: parsed.data.responses,
  })

  if (result.ok) redirect(`/${orgSlug}/m/${slug}?done=checkout`)
  return result
}

export async function checkInAction(
  orgSlug: string,
  slug: string,
  payload: unknown,
): Promise<CheckInResult> {
  const parsed = checkinSubmissionSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, reason: 'invalid' }

  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const session = await getStaffSession(org.id)
  if (!session) redirect(`/${orgSlug}/id?next=${encodeURIComponent(`/${orgSlug}/m/${slug}/checkin`)}`)

  const result = await performCheckIn({
    orgId: org.id,
    employeeId: session.employeeId,
    slug,
    returnLocationId: parsed.data.returnLocationId,
    faultReported: parsed.data.faultReported,
    faultDescription: parsed.data.faultDescription ?? null,
  })

  if (result.ok) redirect(`/${orgSlug}/m/${slug}?done=checkin`)
  return result
}

export async function reportFaultAction(
  orgSlug: string,
  slug: string,
  payload: unknown,
): Promise<ReportFaultResult> {
  const parsed = incidentSubmissionSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, reason: 'invalid' }

  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const session = await getStaffSession(org.id)
  if (!session) redirect(`/${orgSlug}/id?next=${encodeURIComponent(`/${orgSlug}/m/${slug}/incident`)}`)

  const result = await performReportFault({
    orgId: org.id,
    employeeId: session.employeeId,
    slug,
    description: parsed.data.description,
  })

  if (result.ok) redirect(`/${orgSlug}/m/${slug}?done=fault`)
  return result
}

/**
 * The discrepancy report — the one scan-free path, launched from the fleet
 * view's quiet "Not here?" action. On success it returns to the fleet, not the
 * machine page.
 */
export async function reportDiscrepancyAction(
  orgSlug: string,
  slug: string,
): Promise<ReportDiscrepancyResult> {
  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const session = await getStaffSession(org.id)
  if (!session) redirect(`/${orgSlug}/id?next=${encodeURIComponent(`/${orgSlug}/missing/${slug}`)}`)

  const result = await performReportDiscrepancy({
    orgId: org.id,
    employeeId: session.employeeId,
    slug,
  })

  if (result.ok) redirect(`/${orgSlug}/fleet?flagged=missing`)
  return result
}
