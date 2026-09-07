/**
 * Hand-written domain types. Repositories map raw database rows to these, so
 * callers never see Drizzle-inferred shapes and the data source can change
 * later without touching them.
 *
 * Timestamps are ISO 8601 strings, not Date objects — a driver-independent,
 * serialisable representation.
 */

export type MachineStatus = 'available' | 'checked_out' | 'faulty'
export type LocationType = 'store' | 'housekeeping'
export type EmployeeRole = 'staff' | 'manager'
export type IncidentStatus = 'open' | 'cleared'
export type DiscrepancyStatus = 'open' | 'resolved'

export interface Location {
  id: string
  name: string
  type: LocationType
  active: boolean
}

export interface ChecklistTemplateSummary {
  id: string
  name: string
  active: boolean
}

export interface ChecklistItem {
  id: string
  templateId: string
  label: string
  sortOrder: number
  blocking: boolean
}

export interface Machine {
  id: string
  /** Random, unguessable identifier used in the URL. Never the human `code`. */
  slug: string
  /** Human-facing identifier said out loud (VAC-001). Not in the URL. */
  code: string
  name: string
  status: MachineStatus
  active: boolean
  templateId: string | null
  currentLocationId: string | null
}

/** A machine with its template and current location resolved. */
export interface MachineDetail extends Machine {
  template: ChecklistTemplateSummary | null
  currentLocation: Location | null
}

export interface Employee {
  id: string
  fullName: string
  fmId: string
  role: EmployeeRole
  active: boolean
  /** The Supabase Auth user linked to this employee — managers only, else null. */
  authUserId: string | null
}

export interface Checkout {
  id: string
  machineId: string
  employeeId: string
  openedAt: string
  closedAt: string | null
  returnLocationId: string | null
}

export interface Incident {
  id: string
  machineId: string
  employeeId: string
  checkoutId: string | null
  description: string
  status: IncidentStatus
  createdAt: string
}

/**
 * A report that a machine is not where the fleet view says it should be. It is
 * a flag on the machine, never a machine status — "missing" is not "faulty".
 * Worded as a fact about the machine, not an accusation about a person.
 */
export interface Discrepancy {
  id: string
  machineId: string
  reportedBy: string
  /** The most recent closed checkout — the last person known to have had it. */
  lastCheckoutId: string | null
  expectedLocationId: string | null
  status: DiscrepancyStatus
  createdAt: string
}

/** Who is currently holding a checked-out machine. */
export interface FleetHolder {
  employeeId: string
  fullName: string
  fmId: string
  since: string
}

// --- manager dashboard row shapes ------------------------------------------

export interface OpenCheckoutDetail {
  checkoutId: string
  openedAt: string
  machine: { id: string; code: string; name: string }
  holder: { id: string; fullName: string; fmId: string }
}

export interface OpenIncidentDetail {
  id: string
  description: string
  createdAt: string
  machine: { code: string; name: string }
  reporter: { fullName: string; fmId: string }
}

export interface OpenDiscrepancyDetail {
  id: string
  createdAt: string
  machine: { code: string; name: string }
  reporter: { fullName: string }
  expectedLocation: { name: string } | null
  lastHolder: { fullName: string } | null
}

// --- manager admin (Stage 7B) row shapes ---------------------------------

/** One row of the manager machines list. */
export interface ManageMachineRow {
  id: string
  code: string
  name: string
  status: MachineStatus
  active: boolean
  currentLocation: { name: string; active: boolean } | null
  template: { name: string; active: boolean } | null
}

/** A machine looked up for the manager detail / edit screen. */
export interface ManageMachineDetail {
  id: string
  slug: string
  code: string
  name: string
  status: MachineStatus
  active: boolean
  templateId: string | null
  currentLocationId: string | null
  /** True when an open checkout exists — a machine that cannot be deactivated. */
  checkedOut: boolean
}

/**
 * One entry in a machine's activity timeline. A closed-over union of the three
 * things that happen to a machine — a checkout episode, a fault, a missing
 * report — flattened and sorted most-recent-first for the detail screen.
 */
export type MachineHistoryEntry =
  | {
      kind: 'checkout'
      at: string
      closedAt: string | null
      employee: { fullName: string; fmId: string }
      returnLocation: { name: string } | null
    }
  | {
      kind: 'incident'
      at: string
      status: IncidentStatus
      description: string
      reporter: { fullName: string; fmId: string }
    }
  | {
      kind: 'discrepancy'
      at: string
      status: DiscrepancyStatus
      reporter: { fullName: string; fmId: string }
      expectedLocation: { name: string } | null
    }

/** One row of the manager locations screen. */
export interface ManageLocationRow {
  id: string
  name: string
  type: LocationType
  active: boolean
  /** Machines whose current location is this one — blocks a hard delete. */
  machineCount: number
}

/** One row of the manager templates list. */
export interface ManageTemplateRow {
  id: string
  name: string
  active: boolean
  itemCount: number
  /** Machines this template is attached to. */
  machineCount: number
}

/** A template with its live (active) items, for the editor. */
export interface TemplateWithItems {
  id: string
  name: string
  active: boolean
  items: ChecklistItem[]
}

/** One machine reduced to what a printed QR label needs. */
export interface PrintLabel {
  id: string
  code: string
  name: string
  slug: string
  locationId: string | null
  locationName: string | null
}

/** One row of the manager fleet view. */
export interface FleetMachine {
  id: string
  /** URL slug — used only for the "Not here?" discrepancy link. */
  slug: string
  code: string
  name: string
  status: MachineStatus
  currentLocation: Location | null
  /**
   * Set whenever an open checkout exists — including for a machine whose status
   * is 'faulty' because a fault was reported while it was held. A machine can be
   * both held and faulty.
   */
  holder: FleetHolder | null
  /** Set whenever an open incident exists. */
  openIncident: { id: string; description: string; createdAt: string } | null
  /** Set when an open discrepancy exists ("reported missing"). */
  openDiscrepancy: { id: string; createdAt: string } | null
}
