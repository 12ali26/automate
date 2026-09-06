import 'server-only'

import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import {
  STAFF_COOKIE,
  maxSessionHours,
  signStaffToken,
  verifyStaffToken,
  type StaffSession,
} from '@/lib/auth/session-token'
import { findBySlug, type OrgRecord } from '@/lib/repos/orgs'

export { STAFF_COOKIE, type StaffSession }
export type { SignInState } from '@/lib/auth/session-token'

type EmployeeLike = { id: string; fmId: string; fullName: string }
type OrgLike = { id: string; settings: Record<string, unknown> }

/** Mint a staff session for this employee/org and set the cookie. */
export async function createStaffSession(employee: EmployeeLike, org: OrgLike): Promise<void> {
  const hours = maxSessionHours(org.settings)
  const token = await signStaffToken(
    {
      orgId: org.id,
      employeeId: employee.id,
      fmId: employee.fmId,
      fullName: employee.fullName,
      issuedAt: Math.floor(Date.now() / 1000),
    },
    hours,
  )

  const jar = await cookies()
  jar.set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.round(hours * 3600),
  })
}

/**
 * Read and verify the staff session, scoped to `expectedOrgId`. Returns null
 * when there is no cookie, it fails verification, it has expired, or it belongs
 * to a different org.
 */
export async function getStaffSession(expectedOrgId: string): Promise<StaffSession | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value
  if (!token) return null
  return verifyStaffToken(token, expectedOrgId)
}

export async function clearStaffSession(): Promise<void> {
  ;(await cookies()).delete(STAFF_COOKIE)
}

export interface RequiredStaffSession {
  session: StaffSession
  org: OrgRecord
}

/**
 * For pages that require a signed-in staff member. Resolves the slug (404 on an
 * unknown org), then redirects to /{org}/id?next=<current path> when there is
 * no valid session for this org.
 */
export async function requireStaffSession(orgSlug: string): Promise<RequiredStaffSession> {
  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const session = await getStaffSession(org.id)
  if (!session) {
    const current = (await headers()).get('x-pathname') || `/${orgSlug}`
    redirect(`/${orgSlug}/id?next=${encodeURIComponent(current)}`)
  }

  return { session, org }
}
