import { signOutAction } from '@/lib/auth/actions'

/**
 * Shown on every staff screen. The handset is shared, so switching identity
 * must be one tap and always visible — otherwise the next person inherits the
 * last person's session for the rest of the shift.
 */
export function IdentityBar({ orgSlug, fullName }: { orgSlug: string; fullName: string }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
      <span className="min-w-0 truncate text-sm text-gray-700">
        Signed in as <strong className="font-semibold text-gray-900">{fullName}</strong>
      </span>
      <form action={signOutAction.bind(null, orgSlug)}>
        <button
          type="submit"
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-100"
        >
          Not you?
        </button>
      </form>
    </header>
  )
}
