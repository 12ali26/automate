import { loadEnvConfig } from '@next/env'

import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { withOrgContext, type Transaction } from '@/lib/auth/org-context'
import { db } from '@/lib/db'
import * as activity from '@/lib/repos/activity'
import * as machines from '@/lib/repos/machines'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

const rows = <T = Record<string, unknown>>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[]

let failures = 0
const report = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!pass) failures += 1
}

class Rollback extends Error {
  constructor(readonly payload: { orgId: string; reselectOrgId: string | null }) {
    super('rollback')
  }
}

async function main() {
  const demoOrgId = rows<{ id: string }>(
    await db.execute(sql`select id from orgs where slug = 'demo'`),
  )[0]?.id
  if (!demoOrgId) throw new Error('demo org not found — run pnpm db:seed')

  // 1. Fleet list under demo context -> the 5 seeded machines.
  const fleet = await withOrgContext(demoOrgId, (tx) => machines.listForFleet(tx))
  report('1. listForFleet under demo context', fleet.length === 5, `${fleet.length} machines (want 5)`)

  // 2. Fleet list under a random (non-existent) org id -> nothing.
  const otherFleet = await withOrgContext(randomUUID(), (tx) => machines.listForFleet(tx))
  report('2. listForFleet under random org id', otherFleet.length === 0, `${otherFleet.length} machines (want 0)`)

  // 3. Repo invoked without withOrgContext: as the app role with no org context,
  //    RLS yields zero rows.
  const noContext = await db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_authenticated`)
    return machines.listForFleet(tx as Transaction)
  })
  report('3. repo without org context (app role)', noContext.length === 0, `${noContext.length} machines (want 0)`)
  const rawLeak = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from machines`))[0].n
  console.log(
    `      note: the raw lib/db.ts client (BYPASSRLS "postgres" role) sees ${rawLeak} machines; the "repos + withOrgContext only" rule is what keeps that path unreachable`,
  )

  // 4. Sequential contexts with different org ids do not leak into each other.
  let leak = false
  const notes: string[] = []
  for (let i = 0; i < 6; i += 1) {
    const useDemo = i % 2 === 0
    const orgId = useDemo ? demoOrgId : randomUUID()
    const { seen, count } = await withOrgContext(orgId, async (tx) => {
      const seenRow = rows<{ v: string | null }>(
        await tx.execute(sql`select nullif(current_setting('app.current_org', true), '')::uuid as v`),
      )[0]
      const list = await machines.listForFleet(tx)
      return { seen: seenRow.v, count: list.length }
    })
    const wantCount = useDemo ? 5 : 0
    if (seen !== orgId || count !== wantCount) {
      leak = true
      notes.push(`iter ${i}: ctx=${seen ?? 'null'} want ${orgId}, count=${count} want ${wantCount}`)
    }
  }
  const residue = await db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_authenticated`)
    return rows<{ v: string | null }>(
      await tx.execute(sql`select nullif(current_setting('app.current_org', true), '')::uuid as v`),
    )[0].v
  })
  if (residue !== null) {
    leak = true
    notes.push(`residual app.current_org on pooled connection: ${residue}`)
  }
  report('4. no context leak across sequential calls', !leak, leak ? notes.join('; ') : '6 alternating calls isolated; no residue on the connection')

  // 5. activity.log writes a row whose org_id comes from the context (rolled
  //    back afterwards — activity_log is append-only, so no cleanup is possible).
  let payload: { orgId: string; reselectOrgId: string | null } | null = null
  try {
    await withOrgContext(demoOrgId, async (tx) => {
      const res = await activity.log(tx, {
        action: 'verify-1c-probe',
        machineId: fleet[0]?.id ?? null,
        detail: { probe: true },
      })
      const reselectOrgId =
        rows<{ org_id: string }>(
          await tx.execute(sql`select org_id from activity_log where id = ${res.id}::bigint`),
        )[0]?.org_id ?? null
      throw new Rollback({ orgId: res.orgId, reselectOrgId })
    })
  } catch (e) {
    if (e instanceof Rollback) payload = e.payload
    else throw e
  }
  const ok5 = !!payload && payload.orgId === demoOrgId && payload.reselectOrgId === demoOrgId
  report(
    '5. activity.log carries context org_id',
    ok5,
    payload ? `returning=${payload.orgId}, reselect=${payload.reselectOrgId} (want ${demoOrgId})` : 'no row returned',
  )

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
