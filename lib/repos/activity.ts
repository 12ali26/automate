import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'

import { toRows } from './_helpers'

export interface LogInput {
  machineId?: string | null
  employeeId?: string | null
  action: string
  detail?: Record<string, unknown>
}

export interface LoggedActivity {
  id: string
  orgId: string
}

/**
 * Appends a row to activity_log. `org_id` is taken from the transaction's
 * `app.current_org` context, never from the caller, so a log entry can only
 * ever be attributed to the acting tenant. activity_log is append-only
 * (enforced by trigger); there is deliberately no update or delete here.
 */
export async function log(tx: Transaction, input: LogInput): Promise<LoggedActivity> {
  const detail = JSON.stringify(input.detail ?? {})

  const rows = toRows<{ id: string; org_id: string }>(
    await tx.execute(sql`
      insert into activity_log (org_id, machine_id, employee_id, action, detail)
      values (
        nullif(current_setting('app.current_org', true), '')::uuid,
        ${input.machineId ?? null},
        ${input.employeeId ?? null},
        ${input.action},
        ${detail}::jsonb
      )
      returning id, org_id
    `),
  )

  const r = rows[0]
  if (!r) throw new Error('activity.log: insert returned no row')
  return { id: String(r.id), orgId: r.org_id }
}
