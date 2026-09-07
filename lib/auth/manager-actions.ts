'use server'

import { notFound, redirect } from 'next/navigation'

import {
  clearManagerSession,
  createManagerSession,
  getManagerSession,
  type ManagerSignInState,
} from '@/lib/auth/manager-session'
import { withOrgContext } from '@/lib/auth/org-context'
import { signInWithPassword } from '@/lib/auth/supabase-auth'
import * as activity from '@/lib/repos/activity'
import * as employees from '@/lib/repos/employees'
import { findBySlug } from '@/lib/repos/orgs'
import { managerLoginSchema } from '@/lib/validation/manager-auth'

// Deliberately vague: never disclose whether it was the password, the account,
// or the account's role/org that failed. All roads lead here.
const REJECTED = 'Email or password not recognised, or this account cannot manage this facility.'

export async function managerSignInAction(
  orgSlug: string,
  _prev: ManagerSignInState,
  formData: FormData,
): Promise<ManagerSignInState> {
  const parsed = managerLoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details and try again.' }
  }

  const org = await findBySlug(orgSlug)
  if (!org) notFound()

  const auth = await signInWithPassword(parsed.data.email, parsed.data.password)
  if (!auth.ok) {
    if (auth.reason === 'unavailable') {
      return { error: 'Sign-in is temporarily unavailable. Please try again in a moment.' }
    }
    return { error: REJECTED }
  }

  // The auth user must map to a manager employee IN THIS ORG.
  const employee = await withOrgContext(org.id, (tx) =>
    employees.findByAuthUserId(tx, auth.user.id),
  )
  if (!employee || employee.role !== 'manager' || !employee.active) {
    return { error: REJECTED }
  }

  await createManagerSession({
    orgId: org.id,
    employeeId: employee.id,
    authUserId: auth.user.id,
    email: auth.user.email,
    fullName: employee.fullName,
  })
  await withOrgContext(org.id, (tx) =>
    activity.log(tx, { employeeId: employee.id, action: 'manager_sign_in' }),
  )

  redirect(`/${orgSlug}/manage/dashboard`)
}

export async function managerSignOutAction(orgSlug: string): Promise<void> {
  const org = await findBySlug(orgSlug)
  if (org) {
    const session = await getManagerSession(org.id)
    if (session) {
      await withOrgContext(org.id, (tx) =>
        activity.log(tx, { employeeId: session.employeeId, action: 'manager_sign_out' }),
      )
    }
  }
  await clearManagerSession()
  redirect(`/${orgSlug}/manage`)
}
