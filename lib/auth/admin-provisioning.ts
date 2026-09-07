import { assertServiceRoleKeyIsPrivate } from './service-key-guard'

/**
 * Manager auth-user provisioning via Supabase's Admin API (the GoTrue
 * `/auth/v1/admin/*` endpoints).
 *
 * SERVER-ONLY. It authenticates with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses
 * row-level security entirely — never import this from a Client Component. It is
 * used only by the seed and the verification scripts; the running app
 * authenticates managers through the ordinary password grant
 * (see supabase-auth.ts) and never provisions anyone.
 *
 * This replaces an earlier workaround that wrote straight into `auth.users` /
 * `auth.identities` over the Postgres connection. Those tables belong to
 * GoTrue: their shape and invariants change between versions, so hand-writing
 * them breaks silently on a Supabase upgrade — in a way that locks managers
 * out. The Admin API is the supported path, and `email_confirm: true` skips the
 * email-confirmation flow that made the SQL hack seem necessary.
 */

interface AdminConfig {
  url: string
  serviceKey: string
}

function config(): AdminConfig {
  assertServiceRoleKeyIsPrivate()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set — manager provisioning cannot run.')
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — manager provisioning needs it. ' +
        'Supabase dashboard -> Project Settings -> API -> service_role / secret key. ' +
        'Server-only: never prefix it with NEXT_PUBLIC_.',
    )
  }
  return { url: url.replace(/\/$/, ''), serviceKey }
}

function adminHeaders(serviceKey: string): HeadersInit {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
}

export type CreateManagerAuthUserResult =
  // fresh user created
  | { ok: true; authUserId: string }
  // a user with this email already exists — handled, not an error; the id is
  // resolved so callers (e.g. the seed) stay idempotent
  | { ok: false; reason: 'already-exists'; authUserId: string }
  // GoTrue rejected the request (bad password policy, invalid email, …)
  | { ok: false; reason: 'rejected'; detail: string }
  // network / 5xx / unparseable — try again later
  | { ok: false; reason: 'unavailable'; detail: string }

/**
 * Create a confirmed manager auth user. `email_confirm: true` means the user
 * can sign in immediately through the normal password flow — no confirmation
 * email.
 */
export async function createManagerAuthUser(
  email: string,
  password: string,
): Promise<CreateManagerAuthUserResult> {
  const { url, serviceKey } = config()

  let res: Response
  try {
    res = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders(serviceKey),
      body: JSON.stringify({ email, password, email_confirm: true }),
      cache: 'no-store',
    })
  } catch (e) {
    return { ok: false, reason: 'unavailable', detail: String(e) }
  }

  const body: unknown = await res.json().catch(() => null)

  if (res.ok) {
    const id = (body as { id?: unknown } | null)?.id
    if (typeof id !== 'string') {
      return { ok: false, reason: 'unavailable', detail: 'admin create returned no user id' }
    }
    return { ok: true, authUserId: id }
  }

  const errText = errorText(body)
  if (isAlreadyExists(res.status, errText)) {
    const existing = await findAuthUserIdByEmail(url, serviceKey, email)
    if (existing) return { ok: false, reason: 'already-exists', authUserId: existing }
    return {
      ok: false,
      reason: 'unavailable',
      detail: `email already exists but its id could not be looked up (${errText})`,
    }
  }

  if (res.status >= 500) {
    return { ok: false, reason: 'unavailable', detail: `admin API ${res.status}: ${errText}` }
  }
  return { ok: false, reason: 'rejected', detail: errText || `admin API ${res.status}` }
}

/** Delete a manager auth user. A already-absent user is treated as success. */
export async function deleteManagerAuthUser(authUserId: string): Promise<void> {
  const { url, serviceKey } = config()

  const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: 'DELETE',
    headers: adminHeaders(serviceKey),
    cache: 'no-store',
  })

  if (!res.ok && res.status !== 404) {
    const detail = errorText(await res.json().catch(() => null))
    throw new Error(`deleteManagerAuthUser(${authUserId}) failed: ${res.status} ${detail}`)
  }
}

// --- helpers -------------------------------------------------------------

function errorText(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>
  return String(b.msg ?? b.error_description ?? b.error ?? b.message ?? b.error_code ?? '')
}

function isAlreadyExists(status: number, errText: string): boolean {
  if (status !== 400 && status !== 409 && status !== 422) return false
  return /already|registered|exists|duplicate/i.test(errText)
}

/** Page through the admin user list to resolve an email to its user id. */
async function findAuthUserIdByEmail(
  url: string,
  serviceKey: string,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page += 1) {
    let res: Response
    try {
      res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
        headers: adminHeaders(serviceKey),
        cache: 'no-store',
      })
    } catch {
      return null
    }
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as { users?: unknown } | null
    const users = Array.isArray(body?.users) ? (body!.users as Array<{ id?: unknown; email?: unknown }>) : []
    if (users.length === 0) return null
    const hit = users.find(
      (u) => typeof u.email === 'string' && u.email.trim().toLowerCase() === target,
    )
    if (hit && typeof hit.id === 'string') return hit.id
  }
  return null
}
