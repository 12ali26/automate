import { SignJWT, jwtVerify } from 'jose'

/**
 * Pure staff-session token crypto. No cookies, no `next/*` imports — safe to
 * use from any runtime (server components, server actions, edge, test scripts).
 * The cookie glue lives in ./session.ts.
 */

export const STAFF_COOKIE = 'staff_session'
export const DEFAULT_MAX_SESSION_HOURS = 12
const MAX_ALLOWED_SESSION_HOURS = 24 * 7
const JWT_ALG = 'HS256'

export interface StaffSession {
  orgId: string
  employeeId: string
  fmId: string
  fullName: string
  /** epoch seconds when the session was minted */
  issuedAt: number
}

/** Result shape of the sign-in server action, surfaced by the client form. */
export interface SignInState {
  error?: string
}

function sessionSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET
  if (!raw || raw.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short (need at least 16 characters).')
  }
  return new TextEncoder().encode(raw)
}

/** How long a session lasts, from orgs.settings.max_session_hours (default 12). */
export function maxSessionHours(settings: Record<string, unknown> | null | undefined): number {
  const value = settings?.max_session_hours
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_ALLOWED_SESSION_HOURS
  ) {
    return value
  }
  return DEFAULT_MAX_SESSION_HOURS
}

/** Sign a staff session as an HS256 JWT whose exp is issuedAt + `hours`. */
export async function signStaffToken(session: StaffSession, hours: number): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt(session.issuedAt)
    .setExpirationTime(session.issuedAt + Math.round(hours * 3600))
    .sign(sessionSecret())
}

/**
 * Verify a staff token *for a specific org*. Returns null for a bad signature,
 * an expired token, a malformed payload, or — the critical case — a otherwise
 * valid token whose orgId is not `expectedOrgId`. A session for org A must
 * never be honoured on org B's routes.
 */
export async function verifyStaffToken(
  token: string,
  expectedOrgId: string,
): Promise<StaffSession | null> {
  let payload: Record<string, unknown>
  try {
    ;({ payload } = await jwtVerify(token, sessionSecret(), { algorithms: [JWT_ALG] }))
  } catch {
    return null
  }

  const s = payload as Partial<StaffSession>
  if (
    typeof s.orgId !== 'string' ||
    typeof s.employeeId !== 'string' ||
    typeof s.fmId !== 'string' ||
    typeof s.fullName !== 'string' ||
    typeof s.issuedAt !== 'number'
  ) {
    return null
  }
  if (s.orgId !== expectedOrgId) return null

  return {
    orgId: s.orgId,
    employeeId: s.employeeId,
    fmId: s.fmId,
    fullName: s.fullName,
    issuedAt: s.issuedAt,
  }
}
