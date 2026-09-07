import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// orgs (Stage 0)
// ---------------------------------------------------------------------------

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Shared column builders
//
// org_id lives on EVERY table, including child tables where it is technically
// derivable through a join. This is deliberate: it lets Stage 1B express
// row-level security as one uniform policy per table instead of a join per
// check. Child rows are always cascade-deleted with their org.
// ---------------------------------------------------------------------------

const pk = () => uuid('id').primaryKey().defaultRandom()

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

const orgId = () =>
  uuid('org_id')
    .notNull()
    .references(() => orgs.id, { onDelete: 'cascade' })

// ---------------------------------------------------------------------------
// locations
// ---------------------------------------------------------------------------

export const locations = pgTable(
  'locations',
  {
    id: pk(),
    orgId: orgId(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('locations_org_id_name_unique').on(t.orgId, t.name),
    check('locations_type_check', sql`${t.type} in ('store', 'housekeeping')`),
  ],
)

// ---------------------------------------------------------------------------
// employees
// ---------------------------------------------------------------------------

export const employees = pgTable(
  'employees',
  {
    id: pk(),
    orgId: orgId(),
    fullName: text('full_name').notNull(),
    fmId: text('fm_id').notNull(),
    role: text('role').notNull().default('staff'),
    active: boolean('active').notNull().default(true),
    // Set ONLY for managers: the Supabase Auth user that authenticates them.
    // Staff have none — FM ID is identification, not authentication.
    authUserId: uuid('auth_user_id'),
    createdAt: createdAt(),
  },
  (t) => [
    // FM IDs are unique per org, not globally.
    unique('employees_org_id_fm_id_unique').on(t.orgId, t.fmId),
    // One employee per auth user, globally. NULLs are exempt (staff).
    unique('employees_auth_user_id_unique').on(t.authUserId),
    check('employees_role_check', sql`${t.role} in ('staff', 'manager')`),
    index('employees_org_id_active_idx').on(t.orgId).where(sql`${t.active}`),
  ],
)

// ---------------------------------------------------------------------------
// checklist_templates
// ---------------------------------------------------------------------------

export const checklistTemplates = pgTable('checklist_templates', {
  id: pk(),
  orgId: orgId(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

// ---------------------------------------------------------------------------
// checklist_items
// ---------------------------------------------------------------------------

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: pk(),
    orgId: orgId(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => checklistTemplates.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    blocking: boolean('blocking').notNull().default(false),
    // Soft-delete flag. An item with checklist_responses can never be hard
    // deleted — historical answers must keep resolving to a label — so removing
    // it from a template sets active = false instead: gone from new checklists,
    // still readable in old records. Items with no responses are hard deleted.
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    index('checklist_items_template_id_sort_order_idx').on(t.templateId, t.sortOrder),
  ],
)

// ---------------------------------------------------------------------------
// machines
// ---------------------------------------------------------------------------

export const machines = pgTable(
  'machines',
  {
    id: pk(),
    orgId: orgId(),
    // Random, unguessable — this is what goes in the URL (/{org}/m/{slug}).
    slug: text('slug').notNull(),
    // Human-facing identifier (VAC-001). Said out loud; never in the URL.
    code: text('code').notNull(),
    name: text('name').notNull(),
    templateId: uuid('template_id').references(() => checklistTemplates.id),
    currentLocationId: uuid('current_location_id').references(() => locations.id),
    status: text('status').notNull().default('available'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('machines_org_id_code_unique').on(t.orgId, t.code),
    unique('machines_org_id_slug_unique').on(t.orgId, t.slug),
    check(
      'machines_status_check',
      sql`${t.status} in ('available', 'checked_out', 'faulty')`,
    ),
    index('machines_org_id_status_idx').on(t.orgId, t.status),
    index('machines_org_id_current_location_id_idx').on(t.orgId, t.currentLocationId),
  ],
)

// ---------------------------------------------------------------------------
// checkouts
// ---------------------------------------------------------------------------

export const checkouts = pgTable(
  'checkouts',
  {
    id: pk(),
    orgId: orgId(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    returnLocationId: uuid('return_location_id').references(() => locations.id),
  },
  (t) => [
    // Enforces "at most one open checkout per machine" at the database level.
    uniqueIndex('one_open_checkout_per_machine')
      .on(t.machineId)
      .where(sql`${t.closedAt} is null`),
    index('checkouts_org_id_opened_at_idx').on(t.orgId, t.openedAt.desc()),
    check(
      'checkouts_closed_at_after_opened_at_check',
      sql`${t.closedAt} is null or ${t.closedAt} >= ${t.openedAt}`,
    ),
  ],
)

// ---------------------------------------------------------------------------
// checklist_responses
// ---------------------------------------------------------------------------

export const checklistResponses = pgTable(
  'checklist_responses',
  {
    id: pk(),
    orgId: orgId(),
    checkoutId: uuid('checkout_id')
      .notNull()
      .references(() => checkouts.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => checklistItems.id),
    passed: boolean('passed').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('checklist_responses_checkout_id_item_id_unique').on(t.checkoutId, t.itemId),
  ],
)

// ---------------------------------------------------------------------------
// incidents
// ---------------------------------------------------------------------------

export const incidents = pgTable(
  'incidents',
  {
    id: pk(),
    orgId: orgId(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    checkoutId: uuid('checkout_id').references(() => checkouts.id),
    description: text('description').notNull(),
    status: text('status').notNull().default('open'),
    clearedBy: uuid('cleared_by').references(() => employees.id),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('incidents_status_check', sql`${t.status} in ('open', 'cleared')`),
    index('incidents_org_id_status_created_at_idx').on(
      t.orgId,
      t.status,
      t.createdAt.desc(),
    ),
  ],
)

// ---------------------------------------------------------------------------
// discrepancies
// ---------------------------------------------------------------------------

export const discrepancies = pgTable(
  'discrepancies',
  {
    id: pk(),
    orgId: orgId(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id),
    reportedBy: uuid('reported_by')
      .notNull()
      .references(() => employees.id),
    lastCheckoutId: uuid('last_checkout_id').references(() => checkouts.id),
    expectedLocationId: uuid('expected_location_id').references(() => locations.id),
    status: text('status').notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => employees.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('discrepancies_status_check', sql`${t.status} in ('open', 'resolved')`),
    index('discrepancies_org_id_status_created_at_idx').on(
      t.orgId,
      t.status,
      t.createdAt.desc(),
    ),
  ],
)

// ---------------------------------------------------------------------------
// activity_log
// ---------------------------------------------------------------------------

export const activityLog = pgTable(
  'activity_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // No cascade on org_id: activity history must outlive attempts to delete
    // an org (the FK will instead block such a delete).
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    machineId: uuid('machine_id').references(() => machines.id),
    employeeId: uuid('employee_id').references(() => employees.id),
    action: text('action').notNull(),
    detail: jsonb('detail').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_log_org_id_created_at_idx').on(t.orgId, t.createdAt.desc()),
    index('activity_log_machine_id_created_at_idx').on(t.machineId, t.createdAt.desc()),
  ],
)
