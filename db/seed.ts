import { loadEnvConfig } from '@next/env'

import { and, eq, isNull, sql } from 'drizzle-orm'

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
      { orgId: org.id, name: 'Housekeeping 9', type: 'housekeeping' },
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
  // 15 machines so the fleet view (Stage 5) has something realistic to group:
  // a mix of available / checked out / faulty across three locations, with one
  // location (Housekeeping 9) whose machines are all out. VAC-001..005 keep the
  // exact states the earlier stages rely on. Idempotent via (org_id, code).
  await db
    .insert(machines)
    .values(
      Array.from({ length: 15 }, (_, i) => ({
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
  // FM IDs 1001-1010: nine staff and one manager (1010). 1001 is the test
  // account. Realistic names because the app shows full_name to staff trying
  // to locate a machine ("checked out by James O'Brien").
  const employeeNames: Record<string, string> = {
    '1001': 'Maria Santos',
    '1002': "James O'Brien",
    '1003': 'Priya Patel',
    '1004': 'David Okafor',
    '1005': 'Anna Kowalski',
    '1006': 'Wei Chen',
    '1007': 'Fatima Hassan',
    '1008': 'Tom Bradley',
    '1009': 'Grace Mensah',
    '1010': 'Robert Adeyemi',
  }
  await db
    .insert(employees)
    .values(
      Array.from({ length: 10 }, (_, i) => {
        const fmId = String(1001 + i)
        return {
          orgId: org.id,
          fullName: employeeNames[fmId] ?? `Employee ${fmId}`,
          fmId,
          role: i === 9 ? 'manager' : 'staff',
        }
      }),
    )
    // Update on conflict so re-seeding a DB that still has the old
    // "Employee 1001" placeholder names converges to the real names.
    .onConflictDoUpdate({
      target: [employees.orgId, employees.fmId],
      set: { fullName: sql`excluded.full_name`, role: sql`excluded.role` },
    })

  // --- machine states ------------------------------------------------
  // Re-read machines and employees now that they exist.
  const machineRows = await db.select().from(machines).where(eq(machines.orgId, org.id))
  const employeeRows = await db.select().from(employees).where(eq(employees.orgId, org.id))
  const machineByCode = (code: string) => machineRows.find((m) => m.code === code)
  const employeeByFm = (fmId: string) => employeeRows.find((e) => e.fmId === fmId)
  const hk4 = locationRows.find((l) => l.name === 'Housekeeping 4')
  const hk9 = locationRows.find((l) => l.name === 'Housekeeping 9')
  if (!hk4 || !hk9) throw new Error('housekeeping locations missing after insert')

  // Where each machine currently sits (for checked-out machines this is the
  // last return spot, not where they are — the fleet view treats it as a count
  // only). VAC-001 and any code not listed stay at the store (the insert
  // default).
  const locationPlan: Record<string, string> = {
    'VAC-002': hk4.id, // available, last left in housekeeping -> amber marker
    'VAC-008': hk4.id, // available in housekeeping
    'VAC-009': hk4.id, // faulty in housekeeping
    'VAC-011': hk4.id, // out, last returned to hk4
    'VAC-012': hk9.id, // out, last returned to hk9
    'VAC-013': hk9.id, // out, last returned to hk9
    'VAC-014': hk9.id, // out, last returned to hk9  -> hk9 has zero available
  }
  for (const [code, locationId] of Object.entries(locationPlan)) {
    const machine = machineByCode(code)
    if (machine) {
      await db.update(machines).set({ currentLocationId: locationId }).where(eq(machines.id, machine.id))
    }
  }

  // Open checkouts. The sync_machine_status trigger flips machines.status to
  // 'checked_out' on insert. Backdated so the fleet view shows real durations.
  const checkoutPlan: Array<{ code: string; fmId: string; minutesAgo: number }> = [
    { code: 'VAC-003', fmId: '1001', minutesAgo: 135 }, // "2h 15m"
    { code: 'VAC-004', fmId: '1002', minutesAgo: 4400 }, // "3d 1h"
    { code: 'VAC-010', fmId: '1003', minutesAgo: 40 }, // "40m"
    { code: 'VAC-011', fmId: '1004', minutesAgo: 310 }, // "5h 10m"
    { code: 'VAC-012', fmId: '1005', minutesAgo: 90 }, // "1h 30m"
    { code: 'VAC-013', fmId: '1006', minutesAgo: 1500 }, // "1d 1h"
    { code: 'VAC-014', fmId: '1007', minutesAgo: 22 }, // "22m"
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

  // Faulty machines, each with an open incident.
  const faultPlan: Array<{ code: string; fmId: string; description: string }> = [
    { code: 'VAC-005', fmId: '1002', description: 'Loud grinding from the brush motor and a hot smell.' },
    { code: 'VAC-009', fmId: '1004', description: 'Power cable outer sheath split near the plug.' },
  ]
  for (const plan of faultPlan) {
    const machine = machineByCode(plan.code)
    const reporter = employeeByFm(plan.fmId)
    if (!machine) continue
    await db.update(machines).set({ status: 'faulty' }).where(eq(machines.id, machine.id))
    const openIncident = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.machineId, machine.id), eq(incidents.status, 'open')))
    if (openIncident.length === 0 && reporter) {
      await db.insert(incidents).values({
        orgId: org.id,
        machineId: machine.id,
        employeeId: reporter.id,
        description: plan.description,
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

  const countStatus = (s: string) => machs.filter((m) => m.status === s).length
  console.log('Seed complete for org "demo":')
  console.log(`  locations:        ${byOrg(locs)}`)
  console.log(`  checklist templates: ${byOrg(tmpls)}`)
  console.log(`  checklist items:  ${byOrg(items)}`)
  console.log(`  machines:         ${byOrg(machs)}`)
  console.log(
    `  employees:        ${byOrg(emps)} (${emps.filter((e) => e.role === 'manager').length} manager)`,
  )
  console.log('  fleet mix:')
  console.log(`    available:    ${countStatus('available')}`)
  console.log(`    checked out:  ${countStatus('checked_out')}`)
  console.log(`    faulty:       ${countStatus('faulty')}`)
  console.log('    Housekeeping 9: all machines checked out (zero available)')
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
