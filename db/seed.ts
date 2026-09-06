import { loadEnvConfig } from '@next/env'

import { and, eq } from 'drizzle-orm'

import { db } from '../lib/db'
import {
  checklistItems,
  checklistTemplates,
  employees,
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

  console.log('Seed complete for org "demo":')
  console.log(`  locations:        ${byOrg(locs)}`)
  console.log(`  checklist templates: ${byOrg(tmpls)}`)
  console.log(`  checklist items:  ${byOrg(items)}`)
  console.log(`  machines:         ${byOrg(machs)}`)
  console.log(
    `  employees:        ${byOrg(emps)} (${emps.filter((e) => e.role === 'manager').length} manager)`,
  )
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
