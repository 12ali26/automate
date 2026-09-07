/**
 * Pure grouping/sorting for the fleet view. No database, no framework imports —
 * only domain types. The repo (machines.listForFleet) does the joins; this
 * arranges the result for scanning.
 *
 * The one rule that drives the shape: a machine that is HELD (has an open
 * checkout) has NO meaningful current location. current_location_id is only its
 * last return spot. So held machines are never listed under a location — they
 * go in a single "out with someone" list, even if they are also faulty (a fault
 * reported while held). A location may still report how many of its machines
 * are currently out (last returned there), as a count only.
 */

import type { FleetMachine, Location } from './types'

export interface FleetLocationGroup {
  location: Location
  /** available machines physically here now — the takeable ones */
  available: FleetMachine[]
  /** faulty machines sitting here now (not the ones a person is holding) */
  faulty: FleetMachine[]
  /** count of held machines whose last return spot was this location */
  outCount: number
}

export interface FleetGrouping {
  /** location groups, "has available" first, then "has faulty", then by name */
  locationGroups: FleetLocationGroup[]
  /** available machines with no recorded location (edge case) */
  unplacedAvailable: FleetMachine[]
  /** faulty machines with no recorded location (edge case) */
  unplacedFaulty: FleetMachine[]
  /** every checked-out machine, longest-out first — holder + duration */
  out: FleetMachine[]
  totals: { total: number; available: number; faulty: number; out: number }
}

function byNameThenCode(a: FleetMachine, b: FleetMachine): number {
  return a.name.localeCompare(b.name) || a.code.localeCompare(b.code)
}

export function groupFleet(machines: FleetMachine[]): FleetGrouping {
  // "Held" is the dominant physical fact: a held machine is with a person, not
  // at a location — even when it is also faulty. It goes in `out`, never a
  // location group.
  const out = machines
    .filter((m) => m.holder !== null)
    // oldest checkout first == longest currently out
    .sort((a, b) => (a.holder?.since ?? '').localeCompare(b.holder?.since ?? '') || byNameThenCode(a, b))
  const available = machines.filter((m) => m.status === 'available' && m.holder === null)
  const faulty = machines.filter((m) => m.status === 'faulty' && m.holder === null)

  const groups = new Map<string, FleetLocationGroup>()
  const seenOrder: string[] = []
  const groupFor = (loc: Location): FleetLocationGroup => {
    let g = groups.get(loc.id)
    if (!g) {
      g = { location: loc, available: [], faulty: [], outCount: 0 }
      groups.set(loc.id, g)
      seenOrder.push(loc.id)
    }
    return g
  }

  const unplacedAvailable: FleetMachine[] = []
  const unplacedFaulty: FleetMachine[] = []

  for (const m of available) {
    if (m.currentLocation) groupFor(m.currentLocation).available.push(m)
    else unplacedAvailable.push(m)
  }
  for (const m of faulty) {
    if (m.currentLocation) groupFor(m.currentLocation).faulty.push(m)
    else unplacedFaulty.push(m)
  }
  for (const m of out) {
    // a checked-out machine still carries its last return spot — count it there
    // so a location that has emptied out still shows up, but never list it there
    if (m.currentLocation) groupFor(m.currentLocation).outCount += 1
  }

  const locationGroups = seenOrder.map((id) => groups.get(id)!)
  for (const g of locationGroups) {
    g.available.sort(byNameThenCode)
    g.faulty.sort(byNameThenCode)
  }
  locationGroups.sort(
    (a, b) =>
      Number(b.available.length > 0) - Number(a.available.length > 0) ||
      Number(b.faulty.length > 0) - Number(a.faulty.length > 0) ||
      a.location.name.localeCompare(b.location.name),
  )

  unplacedAvailable.sort(byNameThenCode)
  unplacedFaulty.sort(byNameThenCode)

  return {
    locationGroups,
    unplacedAvailable,
    unplacedFaulty,
    out,
    totals: {
      total: machines.length,
      // status counts (a faulty machine is counted faulty even while held)
      available: machines.filter((m) => m.status === 'available').length,
      faulty: machines.filter((m) => m.status === 'faulty').length,
      out: out.length,
    },
  }
}
