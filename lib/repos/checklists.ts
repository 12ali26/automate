import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type {
  ChecklistItem,
  ChecklistTemplateSummary,
  ManageTemplateRow,
  TemplateWithItems,
} from '@/lib/domain/types'
import type { TemplateItemInput } from '@/lib/validation/template'

import { log as logActivity } from './activity'
import { orgIdParam, toRows } from './_helpers'

type Row = {
  id: string
  template_id: string
  label: string
  sort_order: number
  blocking: boolean
}

const mapItem = (r: Row): ChecklistItem => ({
  id: r.id,
  templateId: r.template_id,
  label: r.label,
  sortOrder: r.sort_order,
  blocking: r.blocking,
})

/**
 * The LIVE items of a checklist template, ordered as they should be shown. Only
 * active items — a soft-deleted item (kept so old checklist_responses still
 * resolve to a label) must never appear on a new checklist.
 */
export async function itemsForTemplate(
  tx: Transaction,
  templateId: string,
): Promise<ChecklistItem[]> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      select id, template_id, label, sort_order, blocking
      from checklist_items
      where template_id = ${templateId} and active = true
      order by sort_order asc, id asc
    `),
  )
  return rows.map(mapItem)
}

// -------------------------------------------------------------------------
// Manager admin (Stage 7B)
// -------------------------------------------------------------------------

/** Every template with its live item count and how many machines use it. */
export async function listForManage(tx: Transaction): Promise<ManageTemplateRow[]> {
  const rows = toRows<{
    id: string
    name: string
    active: boolean
    item_count: number
    machine_count: number
  }>(
    await tx.execute(sql`
      select
        t.id, t.name, t.active,
        (select count(*)::int from checklist_items ci
           where ci.template_id = t.id and ci.active = true) as item_count,
        (select count(*)::int from machines m where m.template_id = t.id) as machine_count
      from checklist_templates t
      order by t.active desc, t.name asc
    `),
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    itemCount: r.item_count,
    machineCount: r.machine_count,
  }))
}

/** All templates as {id, name, active} for the machine form's dropdown.
 * Inactive templates are included so an existing attachment still renders. */
export async function listSummaries(tx: Transaction): Promise<ChecklistTemplateSummary[]> {
  const rows = toRows<{ id: string; name: string; active: boolean }>(
    await tx.execute(
      sql`select id, name, active from checklist_templates order by active desc, name asc`,
    ),
  )
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active }))
}

/** A template with its live items, for the editor. Null if not in this org. */
export async function findForManage(
  tx: Transaction,
  id: string,
): Promise<TemplateWithItems | null> {
  const meta = toRows<{ id: string; name: string; active: boolean }>(
    await tx.execute(
      sql`select id, name, active from checklist_templates where id = ${id} limit 1`,
    ),
  )[0]
  if (!meta) return null
  const items = await itemsForTemplate(tx, id)
  return { id: meta.id, name: meta.name, active: meta.active, items }
}

/** Create an (empty) template. Writes a 'template_created' activity_log entry. */
export async function createTemplate(
  tx: Transaction,
  input: { name: string; actorEmployeeId: string },
): Promise<{ id: string }> {
  const rows = toRows<{ id: string }>(
    await tx.execute(sql`
      insert into checklist_templates (org_id, name)
      values (${orgIdParam}, ${input.name})
      returning id
    `),
  )
  const id = rows[0]!.id
  await logActivity(tx, {
    employeeId: input.actorEmployeeId,
    action: 'template_created',
    detail: { name: input.name },
  })
  return { id }
}

export type SaveTemplateResult =
  | { ok: true; items: ChecklistItem[] }
  | { ok: false; reason: 'not-found' }

/**
 * Save a template's name, active flag and full ordered item list in one go.
 *
 * Reconciliation against the submitted list:
 *   - an item with no id is inserted
 *   - an item with an id is updated (label, blocking, sort_order = its position)
 *   - an existing item absent from the list is REMOVED — soft-deleted
 *     (active = false) if it has any checklist_responses, hard deleted if not
 *
 * Soft-delete is what keeps historical checkout records readable: their
 * checklist_responses still join to the item for its label. Writes a
 * 'template_updated' activity_log entry summarising the change.
 */
export async function save(
  tx: Transaction,
  templateId: string,
  input: {
    name: string
    active: boolean
    items: TemplateItemInput[]
    actorEmployeeId: string
  },
): Promise<SaveTemplateResult> {
  const meta = toRows<{ id: string }>(
    await tx.execute(
      sql`select id from checklist_templates where id = ${templateId} limit 1 for update`,
    ),
  )[0]
  if (!meta) return { ok: false, reason: 'not-found' }

  await tx.execute(sql`
    update checklist_templates set name = ${input.name}, active = ${input.active}
    where id = ${templateId}
  `)

  const existing = toRows<{ id: string }>(
    await tx.execute(
      sql`select id from checklist_items where template_id = ${templateId} and active = true`,
    ),
  ).map((r) => r.id)
  const keptIds = new Set(input.items.map((it) => it.id).filter((v): v is string => v != null))

  let inserted = 0
  let updated = 0
  for (let i = 0; i < input.items.length; i += 1) {
    const it = input.items[i]!
    const sortOrder = i + 1
    if (it.id && existing.includes(it.id)) {
      await tx.execute(sql`
        update checklist_items
        set label = ${it.label}, blocking = ${it.blocking}, sort_order = ${sortOrder}
        where id = ${it.id}
      `)
      updated += 1
    } else {
      await tx.execute(sql`
        insert into checklist_items (org_id, template_id, label, sort_order, blocking)
        values (${orgIdParam}, ${templateId}, ${it.label}, ${sortOrder}, ${it.blocking})
      `)
      inserted += 1
    }
  }

  const removedIds = existing.filter((id) => !keptIds.has(id))
  let softDeleted = 0
  let hardDeleted = 0
  for (const id of removedIds) {
    const hasResponses =
      toRows(
        await tx.execute(
          sql`select 1 as x from checklist_responses where item_id = ${id} limit 1`,
        ),
      ).length > 0
    if (hasResponses) {
      await tx.execute(sql`update checklist_items set active = false where id = ${id}`)
      softDeleted += 1
    } else {
      await tx.execute(sql`delete from checklist_items where id = ${id}`)
      hardDeleted += 1
    }
  }

  await logActivity(tx, {
    employeeId: input.actorEmployeeId,
    action: 'template_updated',
    detail: {
      name: input.name,
      active: input.active,
      inserted,
      updated,
      softDeleted,
      hardDeleted,
    },
  })
  return { ok: true, items: await itemsForTemplate(tx, templateId) }
}
