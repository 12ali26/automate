/**
 * Pure business rules for machine state. No database, no framework imports —
 * only domain types.
 */

import type { EmployeeRole, MachineStatus } from './types'

/** A machine can be checked out only when it is active and sitting available. */
export function canCheckOut(machine: { status: MachineStatus; active: boolean }): boolean {
  return machine.active && machine.status === 'available'
}

/** A machine can be checked in only by the employee who currently holds it. */
export function canCheckIn(
  machine: { status: MachineStatus; holder: { employeeId: string } | null },
  employeeId: string,
): boolean {
  return machine.status === 'checked_out' && machine.holder?.employeeId === employeeId
}

/**
 * Whether any blocking checklist item was answered "fail". A blocking failure
 * stops a checkout; a non-blocking failure is only recorded. `responses` need
 * not cover every item — an unanswered item is not a failure here.
 */
export function hasBlockingFailure(
  items: { id: string; blocking: boolean }[],
  responses: { itemId: string; passed: boolean }[],
): boolean {
  const failed = new Set(responses.filter((r) => !r.passed).map((r) => r.itemId))
  return items.some((item) => item.blocking && failed.has(item.id))
}

/**
 * Whether moving a machine from `from` to `to` is allowed for the given role.
 *
 * - staff: available <-> checked_out, and either of those -> faulty (reporting
 *   a fault; the actual fault flow is driven by incidents in Stage 6)
 * - manager: the above, plus faulty -> available (clearing a fault)
 *
 * A no-op (from === to) is not a transition.
 */
export function isLegalTransition(
  from: MachineStatus,
  to: MachineStatus,
  role: EmployeeRole,
): boolean {
  if (from === to) return false

  const base: Record<MachineStatus, MachineStatus[]> = {
    available: ['checked_out', 'faulty'],
    checked_out: ['available', 'faulty'],
    faulty: [],
  }
  const managerExtra: Record<MachineStatus, MachineStatus[]> = {
    available: [],
    checked_out: [],
    faulty: ['available'],
  }

  const allowed = role === 'manager' ? [...base[from], ...managerExtra[from]] : base[from]
  return allowed.includes(to)
}
