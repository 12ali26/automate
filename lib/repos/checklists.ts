import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { ChecklistItem } from '@/lib/domain/types'

import { toRows } from './_helpers'

type Row = {
  id: string
  template_id: string
  label: string
  sort_order: number
  blocking: boolean
}

/** Items of a checklist template, ordered as they should be shown. */
export async function itemsForTemplate(
  tx: Transaction,
  templateId: string,
): Promise<ChecklistItem[]> {
  const rows = toRows<Row>(
    await tx.execute(sql`
      select id, template_id, label, sort_order, blocking
      from checklist_items
      where template_id = ${templateId}
      order by sort_order asc, id asc
    `),
  )
  return rows.map((r) => ({
    id: r.id,
    templateId: r.template_id,
    label: r.label,
    sortOrder: r.sort_order,
    blocking: r.blocking,
  }))
}
