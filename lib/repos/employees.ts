import { sql } from 'drizzle-orm'

import type { Transaction } from '@/lib/auth/org-context'
import type { Employee, EmployeeRole } from '@/lib/domain/types'

import { toRows } from './_helpers'

type Row = {
  id: string
  full_name: string
  fm_id: string
  role: EmployeeRole
  active: boolean
}

const map = (r: Row): Employee => ({
  id: r.id,
  fullName: r.full_name,
  fmId: r.fm_id,
  role: r.role,
  active: r.active,
})

const select = sql`select id, full_name, fm_id, role, active from employees`

/** Active employee with this per-org FM ID, or null. */
export async function findByFmId(
  tx: Transaction,
  fmId: string,
): Promise<Employee | null> {
  const rows = toRows<Row>(
    await tx.execute(sql`${select} where fm_id = ${fmId} and active = true limit 1`),
  )
  return rows[0] ? map(rows[0]) : null
}

/** Employee by id, active or not. */
export async function findById(tx: Transaction, id: string): Promise<Employee | null> {
  const rows = toRows<Row>(await tx.execute(sql`${select} where id = ${id} limit 1`))
  return rows[0] ? map(rows[0]) : null
}
