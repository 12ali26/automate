import 'server-only'

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { withOrgContext } from '@/lib/auth/org-context'
import {
  MANAGER_COOKIE,
  MANAGER_SESSION_HOURS,
  signManagerToken,
  verifyManagerToken,
  type ManagerSession,
} from '@/lib/auth/manager-session-token'
import * as employees from '@/lib/repos/employees'
import { findBySlug, type OrgRecord } from '@/lib/repos/orgs'

export { MANAGER_COOKIE, type ManagerSession }
export type { ManagerSignInState } from '@/lib/auth/manager-session-token'

/** Mint a manager session and set the cookie. Called only after Supabase Auth
 * has verified the password AND the linked employee is a manager of this org. */
export async function createManagerSession(input: {
  orgId: string
  employeeId: string
  authUserId: string
  email: string
  fullName: string
}): Promise<void> {
  const token = await signManagerToken({
    orgId: input.orgId,
    employeeId: input.employeeId,
    authUserId: input.authUserId,
    email: input.email,
    fullName: input.fullName,
    issuedAt: Math.floor(Date.now() / 1000),
  })

  const jar = await cookies()
  jar.set(MANAGER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.round(MANAGER_SESSION_HOURS * 3600),
  })
}

/**
 * Read and verify the manager session, scoped to `expectedOrgId`. Two layers:
 *
 *   1. the token: valid signature, not expired, `typ: 'manager'`, and its
 *      orgId matches — a staff cookie or an org-A token can't pass this.
 *   2. the database: the linked employee still exists in THIS org, is still a
 *      manager, is still active, and is still linked to this same auth user —
 *      so a demoted or removed manager loses access immediately, and RLS
 *      scoping makes an org mismatch impossible even if layer 1 were bypassed.
 */
export async function getManagerSession(
  expectedOrgId: string,
): Promise<ManagerSession | null> {
  const token = (await cookies()).get(MANAGER_COOKIE)?.value
  if (!token) return null

  const session = await verifyManagerToken(token, expectedOrgId)
  if (!session) return null

  const employee = await withOrgContext(expectedOrgId, (tx) =>
    employees.findByAuthUserId(tx, session.authUserId),
  )
  if (
    !employee ||
    employee.id !== session.employeeId ||
    employee.role !== 'manager' ||
    !employee.active
  ) {
    return null
  }

  return session
}

export async function clearManagerSession(): Promise<void> {
  ;(await cookies()).delete(MANAGER_COOKIE)
}

export interface ManagerActor {
  orgId: string
  orgSlug: string
  employeeId: string
}

/**
 * The server-action counterpart to {@link requireManagerSession}: resolves the
 * org slug (404 on unknown), then the manager session (redirect to the login
 * page when absent), and returns the acting org id + employee id. Every manager
 * mutation calls this first; the repo layer re-checks the employee's role as a
 * second gate.
 */
export async function requireManagerForAction(orgSlug: string): Promise<ManagerActor> {
  const org = await findBySlug(orgSlug)
  if (!org) notFound()
  const session = await getManagerSession(org.id)
  if (!session) redirect(`/${orgSlug}/manage`)
  return { orgId: org.id, orgSlug, employeeId: session.employeeId }
}

export interface RequiredManagerSession {
  session: ManagerSession
  org: OrgRecord
}

/**
 * For pages under /{org}/manage/* other than the login page. Resolves the slug
 * (404 on an unknown org), then redirects to /{org}/manage when there is no
 * valid manager session for this org.
 */
export async function requireManagerSession(
  orgSlug: string,
): Promise<RequiredManagerSession> {
  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const session = await getManagerSession(org.id)
  if (!session) redirect(`/${orgSlug}/manage`)

  return { session, org }
}
