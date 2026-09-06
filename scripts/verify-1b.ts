import { loadEnvConfig } from '@next/env'

import { sql } from 'drizzle-orm'

import { db } from '../lib/db'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

// The connection role ("postgres") has BYPASSRLS on Supabase, so RLS never
// applies to it. Checks 1-3 therefore run inside a transaction after
// `SET LOCAL ROLE app_authenticated` (created in migration 0002: no LOGIN, no
// BYPASSRLS) so the org_isolation policy actually takes effect.

type Row = Record<string, unknown>

const rows = (res: unknown): Row[] =>
  Array.isArray(res) ? (res as Row[]) : (((res as { rows?: Row[] }).rows ?? []) as Row[])

function one<T = Row>(res: unknown, what: string): T {
  const list = rows(res)
  if (list.length === 0) throw new Error(`expected a row: ${what}`)
  return list[0] as T
}

let failures = 0

function report(name: string, pass: boolean, detail: string) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!pass) failures += 1
}

class Rollback extends Error {}

// Drizzle wraps driver errors, putting the Postgres message on `.cause`.
function errorChain(e: unknown): string {
  const parts: string[] = []
  let cur: unknown = e
  for (let i = 0; cur && i < 10; i += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message)
      cur = (cur as { cause?: unknown }).cause
    } else {
      parts.push(String(cur))
      break
    }
  }
  return parts.join(' | ')
}

async function main() {
  const { id: demoOrgId } = one<{ id: string }>(
    await db.execute(sql`select id from orgs where slug = 'demo'`),
    'demo org (run pnpm db:seed)',
  )

  // 1. No org context → zero rows.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_authenticated`)
    const { n } = one<{ n: number }>(
      await tx.execute(sql`select count(*)::int as n from machines`),
      'machines count',
    )
    report('1. machines without app.current_org', n === 0, `saw ${n} (want 0)`)
  })

  // 2. Demo org context → the 5 seeded machines.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_authenticated`)
    await tx.execute(sql`select set_config('app.current_org', ${demoOrgId}, true)`)
    const { n } = one<{ n: number }>(
      await tx.execute(sql`select count(*)::int as n from machines`),
      'machines count',
    )
    report('2. machines with demo app.current_org', n === 5, `saw ${n} (want 5)`)
  })

  // 3. Opening a checkout flips machine status to checked_out; closing it flips
  //    back to available. Rolled back afterwards so no test rows persist.
  let statusAfterOpen = ''
  let statusAfterClose = ''
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_authenticated`)
      await tx.execute(sql`select set_config('app.current_org', ${demoOrgId}, true)`)

      const machine = one<{ id: string }>(
        await tx.execute(sql`
          select id from machines
          where org_id = ${demoOrgId} and status = 'available'
          order by code limit 1
        `),
        'an available machine',
      )
      const employee = one<{ id: string }>(
        await tx.execute(sql`
          select id from employees where org_id = ${demoOrgId} order by fm_id limit 1
        `),
        'an employee',
      )

      const checkout = one<{ id: string }>(
        await tx.execute(sql`
          insert into checkouts (org_id, machine_id, employee_id)
          values (${demoOrgId}, ${machine.id}, ${employee.id})
          returning id
        `),
        'inserted checkout',
      )

      statusAfterOpen = one<{ status: string }>(
        await tx.execute(sql`select status from machines where id = ${machine.id}`),
        'machine status',
      ).status

      await tx.execute(
        sql`update checkouts set closed_at = now() where id = ${checkout.id}`,
      )

      statusAfterClose = one<{ status: string }>(
        await tx.execute(sql`select status from machines where id = ${machine.id}`),
        'machine status',
      ).status

      throw new Rollback()
    })
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }
  report(
    '3a. status after opening checkout',
    statusAfterOpen === 'checked_out',
    `status=${statusAfterOpen || '(unset)'} (want checked_out)`,
  )
  report(
    '3b. status after closing checkout',
    statusAfterClose === 'available',
    `status=${statusAfterClose || '(unset)'} (want available)`,
  )

  // 4. UPDATE on activity_log is rejected by the append-only trigger.
  let blocked = false
  let message = ''
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`insert into activity_log (org_id, action) values (${demoOrgId}, 'verify-1b-probe')`,
      )
      await tx.execute(
        sql`update activity_log set action = 'mutated' where action = 'verify-1b-probe'`,
      )
    })
  } catch (err) {
    blocked = true
    message = errorChain(err)
  }
  const appendOnly = /append-only/i.test(message)
  report(
    '4. UPDATE on activity_log',
    blocked && appendOnly,
    blocked
      ? (message.match(/activity_log is append-only/i)?.[0] ?? message.split('\n')[0])
      : 'no exception raised',
  )

  console.log(
    failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
