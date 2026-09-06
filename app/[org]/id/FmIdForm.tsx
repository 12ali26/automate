'use client'

import { useActionState, useState } from 'react'

import { signInAction } from '@/lib/auth/actions'
import { fmIdSchema } from '@/lib/validation/auth'
import type { SignInState } from '@/lib/auth/session-token'

export function FmIdForm({ orgSlug, next }: { orgSlug: string; next: string | null }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInAction.bind(null, orgSlug, next),
    {},
  )
  const [value, setValue] = useState('')

  const parsed = fmIdSchema.safeParse(value)
  const clientError =
    value.trim().length > 0 && !parsed.success ? parsed.error.issues[0]?.message : undefined
  const message = clientError ?? state.error ?? ''

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label htmlFor="fmId" className="text-sm font-medium text-gray-700">
        FM ID
      </label>
      <input
        id="fmId"
        name="fmId"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={message.length > 0}
        aria-describedby="fmId-message"
        className="w-full rounded-xl border border-gray-300 px-4 py-5 text-center text-3xl tracking-[0.3em] tabular-nums outline-none focus:border-gray-900"
      />
      <p id="fmId-message" role="alert" className="min-h-6 text-sm text-red-600">
        {message}
      </p>
      <button
        type="submit"
        disabled={pending || !parsed.success}
        className="rounded-xl bg-gray-900 px-5 py-5 text-xl font-semibold text-white active:bg-gray-700 disabled:opacity-40"
      >
        {pending ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  )
}
