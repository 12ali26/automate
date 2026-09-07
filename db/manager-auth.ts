/**
 * Provisioning helpers for manager Supabase Auth users.
 *
 * These write directly into the Supabase-managed `auth.*` schema over the
 * Postgres connection, because this environment has no service-role key and
 * GoTrue's signup path is email-confirmation gated + rate limited. The RUNTIME
 * app never touches `auth.*` — it authenticates managers through the GoTrue
 * REST API (see lib/auth/supabase-auth.ts). Only the seed and verification
 * scripts use this module.
 *
 * The column set below is the minimum GoTrue's password-grant query can scan
 * without erroring: every nullable token/change string column must be '' (not
 * NULL), and an `auth.identities` row with `sub` + `email` must exist.
 */
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'

const rows = <T = Record<string, unknown>>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[]

/**
 * Create (or reset the password of) a manager auth user, and ensure its email
 * identity row exists. Returns the auth user id — the value that goes in
 * `employees.auth_user_id`. Idempotent on email.
 */
export async function provisionManagerAuthUser(input: {
  email: string
  password: string
}): Promise<string> {
  const { email, password } = input

  const existing = rows<{ id: string }>(
    await db.execute(sql`select id from auth.users where email = ${email} limit 1`),
  )[0]

  let userId: string
  if (existing) {
    userId = existing.id
    await db.execute(sql`
      update auth.users
      set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = ${userId}
    `)
  } else {
    userId = rows<{ id: string }>(
      await db.execute(sql`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, phone_change, phone_change_token, reauthentication_token,
          raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous,
          created_at, updated_at
        )
        values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${email}, extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
          '', '', '', '', '', '', '', '',
          ${JSON.stringify({ provider: 'email', providers: ['email'] })}::jsonb, '{}'::jsonb,
          false, false, false,
          now(), now()
        )
        returning id
      `),
    )[0].id
  }

  await db.execute(sql`
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      ${userId}, ${userId},
      ${JSON.stringify({ sub: userId, email, email_verified: true, phone_verified: false })}::jsonb,
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do update
      set identity_data = excluded.identity_data, updated_at = now()
  `)

  return userId
}

/** Remove a manager auth user and its identities (test cleanup). */
export async function deprovisionManagerAuthUser(email: string): Promise<void> {
  await db.execute(sql`
    delete from auth.identities where user_id in (select id from auth.users where email = ${email})
  `)
  await db.execute(sql`delete from auth.users where email = ${email}`)
}
