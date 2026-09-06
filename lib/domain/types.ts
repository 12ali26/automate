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
  code: string
  name: string
  status: MachineStatus
  currentLocation: Location | null
  /** Set when status is 'checked_out'. */
  holder: FleetHolder | null
  /** Set when status is 'faulty'. */
  openIncident: { id: string; description: string; createdAt: string } | null
}
