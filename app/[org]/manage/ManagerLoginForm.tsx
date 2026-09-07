'use client'

import { useActionState } from 'react'

import { managerSignInAction } from '@/lib/auth/manager-actions'
import type { ManagerSignInState } from '@/lib/auth/manager-session'

export function ManagerLoginForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState<ManagerSignInState, FormData>(
    managerSignInAction.bind(null, orgSlug),
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        Email
        <input
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          required
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-gray-900"
        />
      </label>

      <p role="alert" className="min-h-5 text-sm text-red-600">
        {state.error ?? ''}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gray-950 px-5 py-3 text-base font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
