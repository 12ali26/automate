import { loadEnvConfig } from '@next/env'

import { sql } from 'drizzle-orm'

import { db } from '../lib/db'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

type Row = Record<string, unknown>

const rows = (res: unknown): Row[] =>
  Array.isArray(res) ? (res as Row[]) : (((res as { rows?: Row[] }).rows ?? []) as Row[])

async function main() {
  // The connection role ("postgres") has BYPASSRLS, so these queries see every
  // org's rows without setting app.current_org — the "superuser-ish, org
  // context bypassed" view this check needs.

  // a) machines.status = 'checked_out' but no open checkout exists
  const a = rows(
    await db.execute(sql`
      select m.org_id, m.id, m.code
      from machines m
      where m.status = 'checked_out'
        and not exists (
          select 1 from checkouts c
          where c.machine_id = m.id and c.closed_at is null
        )
      order by m.org_id, m.code
    `),
  )

  // b) an open checkout exists but machines.status <> 'checked_out'
  const b = rows(
    await db.execute(sql`
      select m.org_id, m.id, m.code, m.status
      from machines m
      where m.status <> 'checked_out'
        and exists (
          select 1 from checkouts c
          where c.machine_id = m.id and c.closed_at is null
        )
      order by m.org_id, m.code
    `),
  )

  // c) more than one open checkout for the same machine
  const c = rows(
    await db.execute(sql`
      select machine_id, count(*)::int as open_count
      from checkouts
      where closed_at is null
      group by machine_id
      having count(*) > 1
      order by machine_id
    `),
  )

  const report = (label: string, found: Row[]) => {
    console.log(`${label}: ${found.length}`)
    for (const r of found) console.log(`     ${JSON.stringify(r)}`)
  }

  console.log('Consistency check (all orgs):')
  report('  a) status=checked_out, no open checkout ', a)
  report('  b) open checkout, status<>checked_out   ', b)
  report('  c) machine with >1 open checkout        ', c)

  const total = a.length + b.length + c.length
  if (total === 0) {
    console.log('\nOK — no inconsistencies')
    process.exit(0)
  }
  console.error(`\nFAIL — ${total} inconsistent row(s)`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
