import { loadEnvConfig } from '@next/env'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../lib/db'
import {
  checklistItems,
  checklistTemplates,
  checkouts,
  employees,
  incidents,
  locations,
  machines,
  orgs,
} from './schema'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

async function seed() {
  // --- org -----------------------------------------------------------------
  await db
    .insert(orgs)
    .values({ slug: 'demo', name: 'Demo Facilities' })
    .onConflictDoNothing({ target: orgs.slug })

  const [org] = await db.select().from(orgs).where(eq(orgs.slug, 'demo'))
  if (!org) throw new Error('demo org missing after insert')

  // --- locations ---------------------------------------------------------
  // Idempotent via the (org_id, name) unique constraint.
  await db
    .insert(locations)
    .values([
      { orgId: org.id, name: 'Basement Store', type: 'store' },
      { orgId: org.id, name: 'Housekeeping 4', type: 'housekeeping' },
    ])
    .onConflictDoNothing({ target: [locations.orgId, locations.name] })

  const locationRows = await db
    .select()
    .from(locations)
    .where(eq(locations.orgId, org.id))
  const basementStore = locationRows.find((l) => l.name === 'Basement Store')
  if (!basementStore) throw new Error('Basement Store location missing after insert')

  // --- checklist template + items -------------------------------------
  // checklist_templates has no natural unique key, so guard on (org_id, name).
  let template = (
    await db
      .select()
      .from(checklistTemplates)
      .where(
        and(
          eq(checklistTemplates.orgId, org.id),
          eq(checklistTemplates.name, 'Vacuum Check'),
        ),
      )
  )[0]

  if (!template) {
    template = (
      await db
        .insert(checklistTemplates)
        .values({ orgId: org.id, name: 'Vacuum Check' })
        .returning()
    )[0]
  }
  if (!template) throw new Error('failed to create Vacuum Check template')

  const templateId = template.id

  const existingItems = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.templateId, templateId))

  if (existingItems.length === 0) {
    await db.insert(checklistItems).values([
      {
        orgId: org.id,
        templateId,
        label: 'Brush head clear of debris',
        sortOrder: 1,
        blocking: false,
      },
      {
        orgId: org.id,
        templateId,
        label: 'Dust canister emptied',
        sortOrder: 2,
        blocking: false,
      },
      {
        orgId: org.id,
        templateId,
        label: 'Power cable undamaged',
        sortOrder: 3,
        blocking: true,
      },
      {
        orgId: org.id,
        templateId,
        label: 'Wheels and housing intact',
        sortOrder: 4,
        blocking: false,
      },
    ])
  }

  // --- machines --------------------------------------------------------
  // Idempotent via the (org_id, code) unique constraint.
  await db
    .insert(machines)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        orgId: org.id,
        code: `VAC-${String(i + 1).padStart(3, '0')}`,
        name: `Vacuum ${i + 1}`,
        templateId,
        currentLocationId: basementStore.id,
        status: 'available',
      })),
    )
    .onConflictDoNothing({ target: [machines.orgId, machines.code] })

  // --- employees ----------------------------------------------------
  // FM IDs 1001-1010, nine staff and one manager. Idempotent via the
  // (org_id, fm_id) unique constraint.
  await db
    .insert(employees)
    .values(
      Array.from({ length: 10 }, (_, i) => {
        const fmId = String(1001 + i)
        return {
          orgId: org.id,
          fullName: `Employee ${fmId}`,
          fmId,
          role: i === 9 ? 'manager' : 'staff',
        }
      }),
    )
    .onConflictDoNothing({ target: [employees.orgId, employees.fmId] })

  // --- machine states (Stage 3: one machine per rendering) ------------
  // Re-read machines and employees now that they exist.
  const machineRows = await db.select().from(machines).where(eq(machines.orgId, org.id))
  const employeeRows = await db.select().from(employees).where(eq(employees.orgId, org.id))
  const machineByCode = (code: string) => machineRows.find((m) => m.code === code)
  const employeeByFm = (fmId: string) => employeeRows.find((e) => e.fmId === fmId)
  const housekeeping = locationRows.find((l) => l.name === 'Housekeeping 4')

  // VAC-001 stays available at the store (default).

  // VAC-002: available, but last returned to a housekeeping location so the
  // page shows the amber "at Housekeeping 4" marker (derived from type).
  const vac002 = machineByCode('VAC-002')
  if (vac002 && housekeeping) {
    await db
      .update(machines)
      .set({ currentLocationId: housekeeping.id })
      .where(eq(machines.id, vac002.id))
  }

  // VAC-003 checked out by 1001, VAC-004 by 1002. The sync_machine_status
  // trigger flips machines.status to 'checked_out' on insert. Backdated so the
  // page renders a real duration.
  const checkoutPlan: Array<{ code: string; fmId: string; minutesAgo: number }> = [
    { code: 'VAC-003', fmId: '1001', minutesAgo: 135 }, // "2h 15m"
    { code: 'VAC-004', fmId: '1002', minutesAgo: 4400 }, // "3d 1h"
  ]
  for (const plan of checkoutPlan) {
    const machine = machineByCode(plan.code)
    const employee = employeeByFm(plan.fmId)
    if (!machine || !employee) continue
    const open = await db
      .select()
      .from(checkouts)
      .where(and(eq(checkouts.machineId, machine.id), isNull(checkouts.closedAt)))
    if (open.length === 0) {
      await db.insert(checkouts).values({
        orgId: org.id,
        machineId: machine.id,
        employeeId: employee.id,
        openedAt: new Date(Date.now() - plan.minutesAgo * 60_000),
      })
    }
  }

  // VAC-005: faulty, with an open incident.
  const vac005 = machineByCode('VAC-005')
  if (vac005) {
    await db.update(machines).set({ status: 'faulty' }).where(eq(machines.id, vac005.id))
    const reporter = employeeByFm('1002')
    const openIncident = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.machineId, vac005.id), eq(incidents.status, 'open')))
    if (openIncident.length === 0 && reporter) {
      await db.insert(incidents).values({
        orgId: org.id,
        machineId: vac005.id,
        employeeId: reporter.id,
        description: 'Loud grinding from the brush motor and a hot smell.',
        status: 'open',
      })
    }
  }

  // --- summary ----------------------------------------------------
  const byOrg = <T extends { orgId: string }>(rows: T[]) =>
    rows.filter((r) => r.orgId === org.id).length

  const [locs, tmpls, items, machs, emps] = await Promise.all([
    db.select().from(locations).where(eq(locations.orgId, org.id)),
    db.select().from(checklistTemplates).where(eq(checklistTemplates.orgId, org.id)),
    db.select().from(checklistItems).where(eq(checklistItems.orgId, org.id)),
    db.select().from(machines).where(eq(machines.orgId, org.id)),
    db.select().from(employees).where(eq(employees.orgId, org.id)),
  ])

  const statusOf = (code: string) => machs.find((m) => m.code === code)?.status
  console.log('Seed complete for org "demo":')
  console.log(`  locations:        ${byOrg(locs)}`)
  console.log(`  checklist templates: ${byOrg(tmpls)}`)
  console.log(`  checklist items:  ${byOrg(items)}`)
  console.log(`  machines:         ${byOrg(machs)}`)
  console.log(
    `  employees:        ${byOrg(emps)} (${emps.filter((e) => e.role === 'manager').length} manager)`,
  )
  console.log('  machine states:')
  console.log(`    VAC-001 available @ store        -> ${statusOf('VAC-001')}`)
  console.log(`    VAC-002 available @ housekeeping  -> ${statusOf('VAC-002')}`)
  console.log(`    VAC-003 out by 1001              -> ${statusOf('VAC-003')}`)
  console.log(`    VAC-004 out by 1002              -> ${statusOf('VAC-004')}`)
  console.log(`    VAC-005 faulty + open incident   -> ${statusOf('VAC-005')}`)
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
