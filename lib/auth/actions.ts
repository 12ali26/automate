'use server'

import { notFound, redirect } from 'next/navigation'

import { withOrgContext } from '@/lib/auth/org-context'
import {
  clearStaffSession,
  createStaffSession,
  getStaffSession,
  type SignInState,
} from '@/lib/auth/session'
import * as activity from '@/lib/repos/activity'
import * as employees from '@/lib/repos/employees'
import { findBySlug } from '@/lib/repos/orgs'
import { fmIdSchema } from '@/lib/validation/auth'

/**
 * Only allow post-sign-in redirects to a plain, same-origin path inside this
 * same org. Rejects protocol-relative (`//host`), absolute URLs, and paths for
 * a different org.
 */
function safeNext(next: string | null | undefined, orgSlug: string): string | null {
  if (typeof next !== 'string' || next.length === 0) return null
  if (!next.startsWith(`/${orgSlug}/`)) return null
  if (next.startsWith('//')) return null
  if (next.includes('://') || next.includes('\\') || /\s/.test(next)) return null
  return next
}

export async function signInAction(
  orgSlug: string,
  nextParam: string | null,
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = fmIdSchema.safeParse(formData.get('fmId'))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter your FM ID.' }
  }

  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const employee = await withOrgContext(org.id, (tx) => employees.findByFmId(tx, parsed.data))

  // Deliberately identical whether the FM ID is unknown or belongs to an
  // inactive employee — never disclose which.
  if (!employee) {
    return { error: 'FM ID not recognised. Check the number and try again.' }
  }

  await createStaffSession(employee, org)
  await withOrgContext(org.id, (tx) =>
    activity.log(tx, { employeeId: employee.id, action: 'sign_in' }),
  )

  redirect(safeNext(nextParam, orgSlug) ?? `/${orgSlug}/fleet`)
}

export async function signOutAction(orgSlug: string): Promise<void> {
  const org = await findBySlug(orgSlug)
  if (org) {
    const session = await getStaffSession(org.id)
    if (session) {
      await withOrgContext(org.id, (tx) =>
        activity.log(tx, { employeeId: session.employeeId, action: 'sign_out' }),
      )
    }
  }
  await clearStaffSession()
  redirect(`/${orgSlug}/id`)
}
