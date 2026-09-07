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
