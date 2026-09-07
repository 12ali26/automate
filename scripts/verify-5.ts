import { loadEnvConfig } from '@next/env'

import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { withOrgContext } from '@/lib/auth/org-context'
import { generateMachineSlug } from '@/lib/domain/machine-code'
import { db } from '@/lib/db'
import * as machinesRepo from '@/lib/repos/machines'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

const rows = <T = Record<string, unknown>>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[]

let failures = 0
const report = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!pass) failures += 1
}

async function main() {
  const demoOrgId = rows<{ id: string }>(
    await db.execute(sql`select id from orgs where slug = 'demo'`),
  )[0]?.id
  if (!demoOrgId) throw new Error('demo org not found — run pnpm db:seed')

  // ---- 5. Slug charset: no ambiguous characters across 1000 samples -------
  {
    const bad = new Set<string>()
    let lengthOk = true
    const charset = /^[a-z2-9]+$/
    for (let i = 0; i < 1000; i += 1) {
      const s = generateMachineSlug()
      if (s.length !== 10) lengthOk = false
      for (const ch of s) if ('01oil'.includes(ch) || !charset.test(ch)) bad.add(ch)
    }
    report(
      '5. slug generation: 1000 samples, length 10, no ambiguous chars (0/o/1/l/i)',
      lengthOk && bad.size === 0,
      `lengthOk=${lengthOk}, offendingChars=[${[...bad].join('')}]`,
    )
  }

  // ---- 2. findBySlug resolves the slug; the human code does not ----------
  {
    const target = rows<{ slug: string }>(
      await db.execute(sql`select slug from machines where org_id = ${demoOrgId} and code = 'VAC-001'`),
    )[0]
    const { bySlug, byCode } = await withOrgContext(demoOrgId, async (tx) => ({
      bySlug: await machinesRepo.findBySlug(tx, target.slug),
      byCode: await machinesRepo.findBySlug(tx, 'VAC-001'),
    }))
    report(
      '2. /{org}/m/{slug} resolves; /{org}/m/VAC-001 does not (repo returns null)',
      bySlug?.code === 'VAC-001' && byCode === null,
      `findBySlug('${target.slug}') -> ${bySlug?.code ?? 'null'}, findBySlug('VAC-001') -> ${byCode === null ? 'null' : 'row'}`,
    )
  }

  // ---- 3. Two orgs can share the human code 'VAC-001' without collision --
  {
    const otherOrgSlug = `verify5-${randomUUID().slice(0, 8)}`
    let otherOrgId = ''
    try {
      otherOrgId = rows<{ id: string }>(
        await db.execute(
          sql`insert into orgs (slug, name) values (${otherOrgSlug}, 'Verify 5 Org') returning id`,
        ),
      )[0].id

      const demoV1Slug = rows<{ slug: string }>(
        await db.execute(sql`select slug from machines where org_id = ${demoOrgId} and code = 'VAC-001'`),
      )[0].slug

      const otherV1Slug = generateMachineSlug()
      // Same human code as a demo machine — must not collide (unique is per org).
      await db.execute(sql`
        insert into machines (org_id, slug, code, name, status)
        values (${otherOrgId}, ${otherV1Slug}, 'VAC-001', 'Other Vacuum 1', 'available')
      `)

      const demoRes = await withOrgContext(demoOrgId, (tx) => machinesRepo.findBySlug(tx, demoV1Slug))
      const otherRes = await withOrgContext(otherOrgId, (tx) => machinesRepo.findBySlug(tx, otherV1Slug))
      // The other org's slug must NOT resolve inside the demo context.
      const crossRes = await withOrgContext(demoOrgId, (tx) => machinesRepo.findBySlug(tx, otherV1Slug))

      report(
        "3. code 'VAC-001' in two orgs — no collision; each slug resolves only in its own org",
        demoRes?.code === 'VAC-001' &&
          otherRes?.code === 'VAC-001' &&
          demoRes.id !== otherRes.id &&
          crossRes === null,
        `demo VAC-001=${demoRes?.id?.slice(0, 8)}, other VAC-001=${otherRes?.id?.slice(0, 8)}, other slug in demo ctx -> ${crossRes === null ? 'null' : 'LEAK'}`,
      )
    } finally {
      // No activity_log rows were written for this org, so the FK doesn't block
      // the delete; machines cascade.
      if (otherOrgId) await db.execute(sql`delete from orgs where id = ${otherOrgId}`)
    }
  }

  // ---- 4. regenerateSlug: new slug, old slug 404s, activity row ---------
  {
    const m = rows<{ id: string; slug: string }>(
      await db.execute(sql`select id, slug from machines where org_id = ${demoOrgId} and code = 'VAC-015'`),
    )[0]
    const oldSlug = m.slug
    try {
      const newSlug = await withOrgContext(demoOrgId, (tx) =>
        machinesRepo.regenerateSlug(tx, m.id),
      )

      const { viaOld, viaNew } = await withOrgContext(demoOrgId, async (tx) => ({
        viaOld: await machinesRepo.findBySlug(tx, oldSlug),
        viaNew: await machinesRepo.findBySlug(tx, newSlug ?? ''),
      }))

      const logRow = rows<{ action: string; detail: Record<string, unknown> }>(
        await db.execute(sql`
          select action, detail from activity_log
          where machine_id = ${m.id} and action = 'slug_regenerated'
          order by id desc limit 1
        `),
      )[0]

      report(
        '4. regenerateSlug: slug changes, old slug 404s, activity_log row written',
        !!newSlug &&
          newSlug !== oldSlug &&
          viaOld === null &&
          viaNew?.id === m.id &&
          logRow?.action === 'slug_regenerated' &&
          logRow.detail?.oldSlug === oldSlug &&
          logRow.detail?.newSlug === newSlug,
        `old=${oldSlug} new=${newSlug}, oldResolves=${viaOld !== null}, newResolves=${viaNew?.id === m.id}, log=${JSON.stringify(logRow?.detail)}`,
      )
    } finally {
      // Restore VAC-015's seeded slug so the printed slug list stays usable for
      // manual testing. The activity_log entry is a real record and stays.
      await db.execute(sql`update machines set slug = ${oldSlug} where id = ${m.id}`)
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
