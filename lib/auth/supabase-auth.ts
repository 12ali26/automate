/**
 * Thin wrapper over Supabase Auth (GoTrue) for the ONE thing managers need:
 * verifying an email + password. No SDK — a single REST call. No cookies, no
 * secrets beyond the publishable key, so (like session-token.ts) it is safe to
 * call from any runtime, including verification scripts.
 *
 * This is the real authentication for managers (bcrypt password check against
 * Supabase). Once it succeeds, we mint our own short-lived, org-scoped manager
 * session token (see manager-session-token.ts) and never call GoTrue again for
 * the life of that session.
 */

interface GoTrueConfig {
  url: string
  anonKey: string
}

function config(): GoTrueConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set — manager auth cannot run.',
    )
  }
  return { url: url.replace(/\/$/, ''), anonKey }
}

export interface SupabaseAuthUser {
  id: string
  email: string
}

export type PasswordGrantResult =
  | { ok: true; user: SupabaseAuthUser }
  | { ok: false; reason: 'invalid-credentials' | 'unavailable' }

/**
 * Exchange an email + password for the authenticated user. Wrong credentials
 * come back as `invalid-credentials`; a network / service failure as
 * `unavailable` (so the UI can say "try again" rather than "wrong password").
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordGrantResult> {
  const { url, anonKey } = config()

  let res: Response
  try {
    res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, reason: 'unavailable' }
  }

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'invalid-credentials' }
  }
  if (!res.ok) {
    return { ok: false, reason: 'unavailable' }
  }

  let body: { user?: { id?: unknown; email?: unknown } }
  try {
    body = (await res.json()) as typeof body
  } catch {
    return { ok: false, reason: 'unavailable' }
  }

  const id = body.user?.id
  const userEmail = body.user?.email
  if (typeof id !== 'string' || typeof userEmail !== 'string') {
    return { ok: false, reason: 'unavailable' }
  }

  return { ok: true, user: { id, email: userEmail } }
}
