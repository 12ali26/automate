'use server'

import { notFound, redirect } from 'next/navigation'

import { getStaffSession } from '@/lib/auth/session'
import { performCheckIn, type CheckInResult } from '@/lib/machine/checkin'
import { performCheckOut, type CheckOutResult } from '@/lib/machine/checkout'
import { findBySlug } from '@/lib/repos/orgs'
import { checkinSubmissionSchema } from '@/lib/validation/checkin'
import { checkoutSubmissionSchema } from '@/lib/validation/checkout'

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
