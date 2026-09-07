import { SignJWT, jwtVerify } from 'jose'

/**
 * Pure manager-session token crypto. No cookies, no `next/*` imports — safe
 * from any runtime. Cookie glue lives in ./manager-session.ts.
 *
 * This is a SEPARATE token from the staff session, in a SEPARATE cookie:
 *
 *   - different cookie name (`manager_session` vs `staff_session`)
 *   - a mandatory `typ: 'manager'` claim
 *   - different required claims (authUserId / email, no fmId)
 *
 * so a staff token can never satisfy `verifyManagerToken`, and vice versa. A
 * role field on one shared cookie is exactly the shape that lets that bug in.
 */

export const MANAGER_COOKIE = 'manager_session'
export const MANAGER_SESSION_HOURS = 8
const JWT_ALG = 'HS256'
const TOKEN_TYPE = 'manager'

export interface ManagerSession {
  typ: typeof TOKEN_TYPE
  orgId: string
  employeeId: string
  authUserId: string
  email: string
  fullName: string
  /** epoch seconds when the session was minted */
  issuedAt: number
}

/** Result shape of the manager sign-in server action, surfaced by the form. */
export interface ManagerSignInState {
  error?: string
}

function sessionSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET
  if (!raw || raw.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short (need at least 16 characters).')
  }
  return new TextEncoder().encode(raw)
}

export async function signManagerToken(
  session: Omit<ManagerSession, 'typ'>,
  hours: number = MANAGER_SESSION_HOURS,
): Promise<string> {
  return new SignJWT({ ...session, typ: TOKEN_TYPE })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt(session.issuedAt)
    .setExpirationTime(session.issuedAt + Math.round(hours * 3600))
    .sign(sessionSecret())
}

/**
 * Verify a manager token *for a specific org*. Returns null for a bad
 * signature, an expired token, a malformed payload, a token missing
 * `typ: 'manager'` (e.g. a staff token), or — the critical case — a valid
 * token whose orgId is not `expectedOrgId`.
 */
export async function verifyManagerToken(
  token: string,
  expectedOrgId: string,
): Promise<ManagerSession | null> {
  let payload: Record<string, unknown>
  try {
    ;({ payload } = await jwtVerify(token, sessionSecret(), { algorithms: [JWT_ALG] }))
  } catch {
    return null
  }

  const s = payload as Partial<ManagerSession>
  if (
    s.typ !== TOKEN_TYPE ||
    typeof s.orgId !== 'string' ||
    typeof s.employeeId !== 'string' ||
    typeof s.authUserId !== 'string' ||
    typeof s.email !== 'string' ||
    typeof s.fullName !== 'string' ||
    typeof s.issuedAt !== 'number'
  ) {
    return null
  }
  if (s.orgId !== expectedOrgId) return null

  return {
    typ: TOKEN_TYPE,
    orgId: s.orgId,
    employeeId: s.employeeId,
    authUserId: s.authUserId,
    email: s.email,
    fullName: s.fullName,
    issuedAt: s.issuedAt,
  }
}
