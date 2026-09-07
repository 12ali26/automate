import { z } from 'zod'

/**
 * The manager login form. Shared by the client form and the server action; the
 * server re-parses the raw form values. Kept loose on the password (any
 * non-empty string) — Supabase Auth is the authority on whether it's right.
 */
export const managerLoginSchema = z.object({
  email: z
    .string({ error: 'Enter your email.' })
    .trim()
    .min(1, 'Enter your email.')
    .max(320, 'That email is too long.')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'),
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, 'Enter your password.')
    .max(1024, 'That password is too long.'),
})

export type ManagerLogin = z.infer<typeof managerLoginSchema>
