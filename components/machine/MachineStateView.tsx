import type { ReactNode } from 'react'

import { ActionButton } from './ActionButton'
import { HolderCard } from './HolderCard'

/**
 * All machine-page state logic lives here so conditionals don't scatter across
 * children. The page derives this view model, renders the common header +
 * status line, then hands the rest to this component.
 *
 * The facts are independent flags, not one enum: a machine can be BOTH held
 * and faulty (a fault reported while it was checked out), so the fault card and
 * the holder card can appear together.
 */
export interface MachineView {
  /** An open incident — the machine's status is 'faulty'. */
  fault: { description: string | null; reportedLabel: string | null } | null
  /** An open checkout. `mine` decides whether "Check in" is offered. */
  holder:
    | { mine: true; duration: string; sinceLabel: string }
    | { mine: false; name: string; duration: string; sinceLabel: string }
    | null
  /** An open discrepancy — "reported missing". */
  missing: boolean
  /** Action targets. Absent = not offered here. */
  actions: {
    checkOutHref?: string
    checkInHref?: string
    reportFaultHref?: string
  }
}

export function MachineStateView({ view }: { view: MachineView }) {
  const body = renderBody(view)
  const actions = renderActions(view.actions)
  return (
    <div className="flex flex-1 flex-col gap-6">
      {body ? <div className="flex flex-col gap-4">{body}</div> : null}
      {/* push the primary action into the thumb zone */}
      <div className="flex-1" />
      {actions ? <div className="flex flex-col gap-3 pb-1">{actions}</div> : null}
    </div>
  )
}

function renderBody(view: MachineView): ReactNode {
  const parts: ReactNode[] = []

  if (view.fault) {
    parts.push(
      <div key="fault" className="rounded-xl border-2 border-red-600 bg-red-50 p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-red-700">Reported fault</p>
        <p className="mt-1 text-xl font-semibold text-red-950 break-words">
          {view.fault.description ?? 'A fault has been reported on this machine.'}
        </p>
        {view.fault.reportedLabel ? (
          <p className="mt-2 text-base text-red-800">Reported {view.fault.reportedLabel}</p>
        ) : null}
        <p className="mt-3 text-base font-semibold text-red-900">
          A manager must clear this fault before the machine can be used.
        </p>
      </div>,
    )
  }

  if (view.missing) {
    parts.push(
      <div
        key="missing"
        className="rounded-xl border-2 border-dashed border-slate-500 bg-slate-100 p-4"
      >
        <p className="text-sm font-bold uppercase tracking-wide text-slate-600">Reported missing</p>
        <p className="mt-1 text-lg font-semibold text-slate-900 break-words">
          This machine was reported as not being where it should be.
        </p>
        <p className="mt-2 text-base text-slate-700">
          A supervisor will look into it. If you have it in hand, just check it out or in as normal.
        </p>
      </div>,
    )
  }

  if (view.holder) {
    parts.push(
      view.holder.mine ? (
        <HolderCard
          key="holder"
          holder={null}
          duration={view.holder.duration}
          sinceLabel={view.holder.sinceLabel}
        />
      ) : (
        <HolderCard
          key="holder"
          holder={view.holder.name}
          duration={view.holder.duration}
          sinceLabel={view.holder.sinceLabel}
        />
      ),
    )
  }

  return parts.length > 0 ? parts : null
}

function renderActions(actions: MachineView['actions']): ReactNode {
  const buttons: ReactNode[] = []

  if (actions.checkOutHref) {
    buttons.push(
      <ActionButton key="checkout" variant="primary" href={actions.checkOutHref}>
        Check out
      </ActionButton>,
    )
  }
  if (actions.checkInHref) {
    buttons.push(
      <ActionButton key="checkin" variant="primary" href={actions.checkInHref}>
        Check in
      </ActionButton>,
    )
  }
  if (actions.reportFaultHref) {
    buttons.push(
      <ActionButton key="fault" variant="secondary" href={actions.reportFaultHref}>
        Report a fault
      </ActionButton>,
    )
  }

  return buttons.length > 0 ? buttons : null
}
