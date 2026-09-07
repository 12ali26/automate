/**
 * The Supabase service-role key bypasses row-level security entirely. It must
 * live only in server-side env (`SUPABASE_SERVICE_ROLE_KEY`) and must never be
 * exposed to the browser.
 *
 * Next.js inlines any `NEXT_PUBLIC_*` variable into the client bundle, so the
 * one way this key leaks is someone copying it into a `NEXT_PUBLIC_*` var. This
 * assertion fails the build / process start if that has happened. No imports —
 * safe to call from next.config.ts and from tsx scripts alike.
 */
export function assertServiceRoleKeyIsPrivate(): void {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return

  const leaked = Object.entries(process.env).filter(
    ([name, value]) => name.startsWith('NEXT_PUBLIC_') && typeof value === 'string' && value.includes(key),
  )

  if (leaked.length > 0) {
    const names = leaked.map(([n]) => n).join(', ')
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY is present in client-exposed env var(s): ${names}. ` +
        'The service-role key bypasses RLS and must never reach the client. ' +
        'Remove it from every NEXT_PUBLIC_* variable.',
    )
  }
}
