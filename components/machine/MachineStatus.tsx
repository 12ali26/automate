import { StateBadge } from './StateBadge'

/**
 * The status + location line.
 *
 * - available: "AVAILABLE · Basement Store" on one line. Location carries more
 *   visual weight than the machine code — it's what the person acts on. When
 *   the location type isn't 'store' the location portion gets the amber
 *   treatment.
 * - checked_out: status only. The machine is with its holder, not at
 *   current_location_id (its last return spot), so showing that field would
 *   send people to an empty shelf. HolderCard answers "where is it".
 * - faulty: keeps its own prominent red badge, with the location below it.
 *
 * `missing` (an open discrepancy) adds a neutral slate marker — deliberately
 * neither amber (housekeeping) nor red (faulty).
 */
export interface MachineStatusView {
  state: 'available' | 'checked_out' | 'faulty'
  locationName: string | null
  offStore: boolean
  missing: boolean
}

function LocationText({ name, offStore }: { name: string; offStore: boolean }) {
  if (offStore) {
    return (
      <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xl font-extrabold text-amber-950">
        <span aria-hidden>▲ </span>
        {name}
      </span>
    )
  }
  return <span className="text-xl font-extrabold text-gray-950">{name}</span>
}

function MissingChip() {
  return (
    <span className="rounded border border-dashed border-slate-500 bg-slate-100 px-1.5 py-0.5 text-sm font-bold uppercase tracking-wide text-slate-700">
      Reported missing
    </span>
  )
}

export function MachineStatus({ view }: { view: MachineStatusView }) {
  if (view.state === 'faulty') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state="faulty" />
          {view.missing ? <MissingChip /> : null}
        </div>
        {view.locationName ? (
          <LocationText name={view.locationName} offStore={view.offStore} />
        ) : null}
      </div>
    )
  }

  const label = view.state === 'available' ? 'Available' : 'Checked out'
  const labelClass = view.state === 'available' ? 'text-green-800' : 'text-blue-800'
  const locationName = view.state === 'available' ? view.locationName : null
  const offStore = view.state === 'available' ? view.offStore : false

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={`text-base font-bold uppercase tracking-wide ${labelClass}`}>{label}</span>
      {locationName ? (
        <>
          <span aria-hidden className="text-gray-400">
            ·
          </span>
          <LocationText name={locationName} offStore={offStore} />
        </>
      ) : null}
      {view.missing ? <MissingChip /> : null}
    </p>
  )
}
