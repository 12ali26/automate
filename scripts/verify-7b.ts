import { loadEnvConfig } from '@next/env'

import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { withOrgContext } from '@/lib/auth/org-context'
import { db } from '@/lib/db'
import * as checklistsRepo from '@/lib/repos/checklists'
import * as locationsRepo from '@/lib/repos/locations'
import * as machinesRepo from '@/lib/repos/machines'

// Stage 7B: machines admin, QR printing, locations, checklist templates.
// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

const rows = <T = Record<string, unknown>>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[]

let failures = 0
const report = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!pass) failures += 1
}

async function consistencyOk() {
  const q = async (s: ReturnType<typeof sql>) => rows(await db.execute(s)).length
  const a = await q(sql`select 1 from machines m where m.status='checked_out' and not exists (select 1 from checkouts c where c.machine_id=m.id and c.closed_at is null)`)
  const b = await q(sql`select 1 from machines m where m.status not in ('checked_out','faulty') and exists (select 1 from checkouts c where c.machine_id=m.id and c.closed_at is null)`)
  const c = await q(sql`select machine_id from checkouts where closed_at is null group by machine_id having count(*)>1`)
  const d = await q(sql`select 1 from machines m where m.status='faulty' and not exists (select 1 from incidents i where i.machine_id=m.id and i.status='open') and not exists (select 1 from checkouts c where c.machine_id=m.id and c.closed_at is null)`)
  return { a, b, c, d, ok: a + b + c + d === 0 }
}

/**
 * Remove anything a previous run left behind (its teardown may have been
 * interrupted). Uses session_replication_role = replica so the append-only
 * activity_log trigger and FK-enforcement triggers step aside for the delete.
 * Everything this script creates is prefixed V7B / v7b.
 */
async function purge() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`)
    const orphanMachines = rows<{ id: string }>(
      await tx.execute(sql`select id from machines where code like 'V7B-%'`),
    ).map((r) => r.id)
    for (const id of orphanMachines) {
      await tx.execute(sql`delete from checklist_responses where checkout_id in (select id from checkouts where machine_id = ${id})`)
      await tx.execute(sql`delete from checkouts where machine_id = ${id}`)
      await tx.execute(sql`delete from activity_log where machine_id = ${id}`)
      await tx.execute(sql`delete from machines where id = ${id}`)
    }
    const orphanTemplates = rows<{ id: string }>(
      await tx.execute(sql`select id from checklist_templates where name like 'V7B Tpl%'`),
    ).map((r) => r.id)
    for (const id of orphanTemplates) {
      await tx.execute(sql`delete from checklist_responses where item_id in (select id from checklist_items where template_id = ${id})`)
      await tx.execute(sql`delete from checklist_items where template_id = ${id}`)
      await tx.execute(sql`update machines set template_id = null where template_id = ${id}`)
      await tx.execute(sql`delete from checklist_templates where id = ${id}`)
    }
    await tx.execute(sql`delete from activity_log where action like 'template_%' and detail->>'name' like 'V7B Tpl%'`)
    const orphanOrgs = rows<{ id: string }>(
      await tx.execute(sql`select id from orgs where slug like 'v7b-%'`),
    ).map((r) => r.id)
    for (const id of orphanOrgs) {
      await tx.execute(sql`delete from activity_log where org_id = ${id}`)
      await tx.execute(sql`delete from checkouts where org_id = ${id}`)
      await tx.execute(sql`delete from machines where org_id = ${id}`)
      await tx.execute(sql`delete from employees where org_id = ${id}`)
      await tx.execute(sql`delete from locations where org_id = ${id}`)
      await tx.execute(sql`delete from orgs where id = ${id}`)
    }
    await tx.execute(sql`update machines set current_location_id = (select id from locations l2 where l2.org_id = machines.org_id and l2.type = 'store' and l2.active order by l2.name limit 1) where current_location_id in (select id from locations where name like 'V7B Loc%')`)
    await tx.execute(sql`delete from activity_log where action like 'location_%' and detail->>'name' like 'V7B Loc%'`)
    await tx.execute(sql`delete from locations where name like 'V7B Loc%'`)
  })
}

async function main() {
  await purge()

  const demoOrgId = rows<{ id: string }>(await db.execute(sql`select id from orgs where slug='demo'`))[0]?.id
  if (!demoOrgId) throw new Error('demo org not found — run pnpm db:seed')

  const manager = rows<{ id: string }>(
    await db.execute(sql`select id from employees where org_id=${demoOrgId} and fm_id='1010'`),
  )[0]
  const staff = rows<{ id: string }>(
    await db.execute(sql`select id from employees where org_id=${demoOrgId} and fm_id='1001'`),
  )[0]
  if (!manager || !staff) throw new Error('demo employees missing — run pnpm db:seed')
  const actor = manager.id

  const storeId = rows<{ id: string }>(
    await db.execute(sql`select id from locations where org_id=${demoOrgId} and type='store' limit 1`),
  )[0].id

  // Track ids to clean up regardless of pass/fail.
  const cleanupMachines: string[] = []
  const cleanupLocations: string[] = []
  const cleanupTemplates: string[] = []
  let otherOrgId = ''

  try {
    // ---- 1. Create a machine: slug generated, in the list, log written ----
    const code1 = `V7B-${randomUUID().slice(0, 6).toUpperCase()}`
    const created = await withOrgContext(demoOrgId, (tx) =>
      machinesRepo.create(tx, {
        code: code1,
        name: 'Verify 7B machine',
        templateId: null,
        locationId: storeId,
        actorEmployeeId: actor,
      }),
    )
    if (created.ok) cleanupMachines.push(created.id)
    const inList = created.ok
      ? await withOrgContext(demoOrgId, async (tx) => {
          const { rows: r } = await machinesRepo.listForManage(tx, { limit: 500, offset: 0 })
          return r.some((m) => m.id === created.id && m.code === code1)
        })
      : false
    const logWritten =
      created.ok &&
      rows(
        await db.execute(
          sql`select 1 from activity_log where org_id=${demoOrgId} and machine_id=${created.id} and action='machine_created'`,
        ),
      ).length === 1
    const slugOk = created.ok && /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/.test(created.slug)
    report(
      '1. create machine: slug auto-generated, appears in list, activity_log written',
      created.ok && slugOk && inList && logWritten,
      `ok=${created.ok}, slug=${created.ok ? created.slug : '-'}, inList=${inList}, log=${logWritten}`,
    )

    // ---- 2. Duplicate code within an org -> rejected ---------------------
    const dup = await withOrgContext(demoOrgId, (tx) =>
      machinesRepo.create(tx, {
        code: code1,
        name: 'dupe',
        templateId: null,
        locationId: storeId,
        actorEmployeeId: actor,
      }),
    )
    if (dup.ok) cleanupMachines.push(dup.id)
    report(
      '2. duplicate machine code within an org is rejected (handled, not a 23505 throw)',
      dup.ok === false && dup.reason === 'duplicate-code',
      `result=${JSON.stringify(dup)}`,
    )

    // ---- 3. Same code in two different orgs -> allowed -----------------
    otherOrgId = rows<{ id: string }>(
      await db.execute(
        sql`insert into orgs (slug, name) values (${'v7b-' + randomUUID().slice(0, 8)}, 'V7B Org') returning id`,
      ),
    )[0].id
    const otherStore = rows<{ id: string }>(
      await db.execute(
        sql`insert into locations (org_id, name, type) values (${otherOrgId}, 'Store', 'store') returning id`,
      ),
    )[0].id
    // Raw insert in the other org (not the repo — keeps this temp org free of
    // activity_log rows, which are append-only and would block its teardown).
    let crossOrgOk = false
    let crossOrgDetail = ''
    try {
      const r = rows<{ id: string }>(
        await db.execute(sql`
          insert into machines (org_id, slug, code, name, current_location_id, status)
          values (${otherOrgId}, substr(md5(random()::text), 1, 10), ${code1}, 'same code, other org', ${otherStore}, 'available')
          returning id
        `),
      )
      crossOrgOk = r.length === 1
      crossOrgDetail = `inserted id=${r[0]?.id}`
    } catch (e) {
      crossOrgDetail = `threw: ${(e as Error).message}`
    }
    report(
      '3. the same machine code is allowed in a different org',
      crossOrgOk,
      crossOrgDetail,
    )

    // ---- 4. Deactivate a checked-out machine -> refused --------------
    const m4 = created.ok ? created.id : ''
    await db.execute(
      sql`insert into checkouts (org_id, machine_id, employee_id) values (${demoOrgId}, ${m4}, ${staff.id})`,
    )
    const deact = await withOrgContext(demoOrgId, (tx) =>
      machinesRepo.update(tx, m4, {
        code: code1,
        name: 'Verify 7B machine',
        templateId: null,
        locationId: storeId,
        active: false,
        actorEmployeeId: actor,
      }),
    )
    await db.execute(sql`update checkouts set closed_at = now(), return_location_id = ${storeId} where machine_id = ${m4} and closed_at is null`)
    report(
      '4. deactivating a checked-out machine is refused with a clear reason',
      deact.ok === false && deact.reason === 'checked-out',
      `result=${JSON.stringify(deact)}`,
    )

    // ---- 5. Regenerate slug -> old 404s, new resolves --------------
    const before = created.ok ? created.slug : ''
    const newSlug = await withOrgContext(demoOrgId, (tx) => machinesRepo.regenerateSlug(tx, m4))
    const oldGone = await withOrgContext(demoOrgId, (tx) => machinesRepo.findBySlug(tx, before))
    const newResolves = await withOrgContext(demoOrgId, (tx) => machinesRepo.findBySlug(tx, newSlug ?? ''))
    report(
      '5. regenerate slug: the old slug no longer resolves, the new one does',
      newSlug != null && newSlug !== before && oldGone === null && newResolves?.id === m4,
      `old=${before} -> ${oldGone === null ? 'null' : 'STILL RESOLVES'}, new=${newSlug} -> ${newResolves?.id === m4 ? 'resolves' : 'MISSING'}`,
    )

    // ---- 6. Print sheet: the encoded URL is correct ---------------
    const origin = 'https://example.test'
    const labels = await withOrgContext(demoOrgId, (tx) => machinesRepo.listForPrint(tx))
    const mine = labels.find((l) => l.id === m4)
    const encoded = mine ? `${origin}/demo/m/${mine.slug}` : ''
    report(
      '6. print label URL encodes https://<host>/<org>/m/<slug> with the live slug',
      mine != null && encoded === `${origin}/demo/m/${newSlug}` && mine.slug === newSlug,
      `encoded=${encoded}`,
    )

    // ---- 7. Delete the last active store -> refused -------------
    // The demo org has exactly one store (Basement Store). Deleting it must fail.
    const storeCount = await withOrgContext(demoOrgId, (tx) => locationsRepo.countActiveStores(tx))
    const delStore = await withOrgContext(demoOrgId, (tx) =>
      locationsRepo.remove(tx, storeId, actor),
    )
    report(
      '7. deleting the last active store is refused',
      storeCount === 1 && delStore.ok === false && delStore.reason === 'last-store',
      `activeStores=${storeCount}, result=${JSON.stringify(delStore)}`,
    )

    // ---- 8. Delete a location with machines -> refused, deactivate offered ---
    const loc8Name = `V7B Loc ${randomUUID().slice(0, 6)}`
    const loc8 = await withOrgContext(demoOrgId, (tx) =>
      locationsRepo.create(tx, { name: loc8Name, type: 'housekeeping', actorEmployeeId: actor }),
    )
    if (loc8.ok) cleanupLocations.push(loc8.id)
    // Point the verify machine at it.
    await db.execute(sql`update machines set current_location_id = ${loc8.ok ? loc8.id : null} where id = ${m4}`)
    const del8 = await withOrgContext(demoOrgId, (tx) =>
      locationsRepo.remove(tx, loc8.ok ? loc8.id : '', actor),
    )
    // Deactivate keeps the same name — only `active` flips.
    const deact8 = await withOrgContext(demoOrgId, (tx) =>
      locationsRepo.update(tx, loc8.ok ? loc8.id : '', {
        name: loc8Name,
        type: 'housekeeping',
        active: false,
        actorEmployeeId: actor,
      }),
    )
    await db.execute(sql`update machines set current_location_id = ${storeId} where id = ${m4}`)
    report(
      '8. deleting a referenced location is refused (in-use); deactivating it instead works',
      del8.ok === false && del8.reason === 'in-use' && deact8.ok === true,
      `delete=${JSON.stringify(del8)}, deactivate=${JSON.stringify(deact8)}`,
    )

    // ---- 9. Soft-delete a checklist item that has responses -------
    const tpl = await withOrgContext(demoOrgId, (tx) =>
      checklistsRepo.createTemplate(tx, { name: `V7B Tpl ${randomUUID().slice(0, 6)}`, actorEmployeeId: actor }),
    )
    cleanupTemplates.push(tpl.id)
    // Two items via save.
    let saved = await withOrgContext(demoOrgId, (tx) =>
      checklistsRepo.save(tx, tpl.id, {
        name: 'V7B Tpl',
        active: true,
        items: [
          { id: '', label: 'Keep me', blocking: false },
          { id: '', label: 'Historic item', blocking: true },
        ],
        actorEmployeeId: actor,
      }),
    )
    if (!saved.ok) throw new Error('verify 7b: template save failed')
    const historicItem = saved.items.find((it) => it.label === 'Historic item')!
    // A closed checkout + a response referencing the historic item. Insert it
    // open then close it, so the status-sync trigger returns the machine to
    // 'available' (an INSERT with closed_at already set would leave it stuck
    // 'checked_out').
    const co = rows<{ id: string }>(
      await db.execute(
        sql`insert into checkouts (org_id, machine_id, employee_id) values (${demoOrgId}, ${m4}, ${staff.id}) returning id`,
      ),
    )[0].id
    await db.execute(
      sql`update checkouts set closed_at = now(), return_location_id = ${storeId} where id = ${co}`,
    )
    await db.execute(
      sql`insert into checklist_responses (org_id, checkout_id, item_id, passed) values (${demoOrgId}, ${co}, ${historicItem.id}, true)`,
    )
    // Remove the historic item from the template.
    saved = await withOrgContext(demoOrgId, (tx) =>
      checklistsRepo.save(tx, tpl.id, {
        name: 'V7B Tpl',
        active: true,
        items: [{ id: saved.ok ? saved.items.find((it) => it.label === 'Keep me')!.id : '', label: 'Keep me', blocking: false }],
        actorEmployeeId: actor,
      }),
    )
    const stillResolves = rows<{ label: string; active: boolean }>(
      await db.execute(sql`
        select ci.label, ci.active
        from checklist_responses cr join checklist_items ci on ci.id = cr.item_id
        where cr.checkout_id = ${co}
      `),
    )[0]
    const notInLive = saved.ok && !saved.items.some((it) => it.id === historicItem.id)
    report(
      '9. removing a checklist item with responses soft-deletes it: history still shows its label',
      stillResolves?.label === 'Historic item' && stillResolves?.active === false && notInLive,
      `responseLabel=${stillResolves?.label}, itemActive=${stillResolves?.active}, goneFromLive=${notInLive}`,
    )

    // ---- 10. Hard-delete an unused checklist item ---------------
    let saved10 = await withOrgContext(demoOrgId, (tx) =>
      checklistsRepo.save(tx, tpl.id, {
        name: 'V7B Tpl',
        active: true,
        items: [
          { id: saved.ok ? saved.items[0]!.id : '', label: 'Keep me', blocking: false },
          { id: '', label: 'Throwaway', blocking: false },
        ],
        actorEmployeeId: actor,
      }),
    )
    if (!saved10.ok) throw new Error('verify 7b: template save (10) failed')
    const throwaway = saved10.items.find((it) => it.label === 'Throwaway')!
    saved10 = await withOrgContext(demoOrgId, (tx) =>
      checklistsRepo.save(tx, tpl.id, {
        name: 'V7B Tpl',
        active: true,
        items: [{ id: saved10.ok ? saved10.items.find((it) => it.label === 'Keep me')!.id : '', label: 'Keep me', blocking: false }],
        actorEmployeeId: actor,
      }),
    )
    const gone = rows(
      await db.execute(sql`select 1 from checklist_items where id = ${throwaway.id}`),
    ).length === 0
    report(
      '10. removing a checklist item with no responses hard-deletes it',
      gone,
      `item ${throwaway.id} present=${!gone}`,
    )

    // ---- 11. consistency-check still clean ------------------
    const c = await consistencyOk()
    report('11. consistency-check passes', c.ok, `a=${c.a} b=${c.b} c=${c.c} d=${c.d}`)
  } finally {
    // Teardown. activity_log is append-only (a trigger blocks DELETE) and is
    // wired with plain FKs that would block deleting the machines/orgs it
    // references. session_replication_role = replica suspends BOTH user triggers
    // and FK-enforcement triggers for this one transaction — the standard way
    // to tear down test fixtures — so rows can be removed in any order and the
    // demo data is left exactly as the seed produced it.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`)
      for (const id of cleanupMachines) {
        await tx.execute(sql`delete from checklist_responses where checkout_id in (select id from checkouts where machine_id = ${id})`)
        await tx.execute(sql`delete from checkouts where machine_id = ${id}`)
        await tx.execute(sql`delete from activity_log where machine_id = ${id}`)
        await tx.execute(sql`delete from machines where id = ${id}`)
      }
      for (const id of cleanupTemplates) {
        await tx.execute(sql`delete from activity_log where action like 'template_%' and detail->>'name' like 'V7B Tpl%'`)
        await tx.execute(sql`delete from checklist_responses where item_id in (select id from checklist_items where template_id = ${id})`)
        await tx.execute(sql`delete from checklist_items where template_id = ${id}`)
        await tx.execute(sql`update machines set template_id = null where template_id = ${id}`)
        await tx.execute(sql`delete from checklist_templates where id = ${id}`)
      }
      for (const id of cleanupLocations) {
        await tx.execute(sql`delete from activity_log where action like 'location_%' and detail->>'name' like 'V7B Loc%'`)
        await tx.execute(sql`update machines set current_location_id = ${storeId} where current_location_id = ${id}`)
        await tx.execute(sql`delete from locations where id = ${id}`)
      }
      if (otherOrgId) {
        await tx.execute(sql`delete from activity_log where org_id = ${otherOrgId}`)
        await tx.execute(sql`delete from machines where org_id = ${otherOrgId}`)
        await tx.execute(sql`delete from employees where org_id = ${otherOrgId}`)
        await tx.execute(sql`delete from locations where org_id = ${otherOrgId}`)
        await tx.execute(sql`delete from orgs where id = ${otherOrgId}`)
      }
    })
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
