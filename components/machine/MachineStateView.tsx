import type { ReactNode } from 'react'

import { ActionButton } from './ActionButton'
import { HolderCard } from './HolderCard'

/**
 * All machine-page state logic lives here so conditionals don't scatter across
 * children. The page derives this view model, renders the common header +
 * badge, then hands the rest to this component.
 */
export type MachineView =
  | { state: 'available' }
  | { state: 'out_by_me'; duration: string; sinceLabel: string }
  | { state: 'out_by_other'; holderName: string; duration: string; sinceLabel: string }
  | { state: 'faulty'; description: string | null; reportedLabel: string | null }

export function MachineStateView({ view }: { view: MachineView }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4">{renderBody(view)}</div>
      {/* push the primary action into the thumb zone */}
      <div className="flex-1" />
      <div className="flex flex-col gap-3 pb-1">{renderActions(view)}</div>
    </div>
  )
}

function renderBody(view: MachineView): ReactNode {
  switch (view.state) {
    case 'available':
      return (
        <p className="text-xl font-medium text-gray-800">
          Ready to take. Run the checklist before you go.
        </p>
      )
    case 'out_by_me':
      return <HolderCard holder={null} duration={view.duration} sinceLabel={view.sinceLabel} />
    case 'out_by_other':
      return (
        <HolderCard
          holder={view.holderName}
          duration={view.duration}
          sinceLabel={view.sinceLabel}
        />
      )
    case 'faulty':
      return (
        <div className="rounded-xl border-2 border-red-600 bg-red-50 p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-red-700">Reported fault</p>
          <p className="mt-1 text-xl font-semibold text-red-950 break-words">
            {view.description ?? 'A fault has been reported on this machine.'}
          </p>
          {view.reportedLabel ? (
            <p className="mt-2 text-base text-red-800">Reported {view.reportedLabel}</p>
          ) : null}
          <p className="mt-3 text-base font-semibold text-red-900">
            A manager must clear this fault before the machine can be used.
          </p>
        </div>
      )
  }
}

function renderActions(view: MachineView): ReactNode {
  switch (view.state) {
    case 'available':
      return (
        <>
          <ActionButton variant="primary">Check out</ActionButton>
          <ActionButton variant="secondary" tone="danger">
            Report a fault
          </ActionButton>
        </>
      )
    case 'out_by_me':
      return (
        <>
          <ActionButton variant="primary">Check in</ActionButton>
          <ActionButton variant="secondary" tone="danger">
            Report a fault
          </ActionButton>
        </>
      )
    case 'out_by_other':
      return (
        <ActionButton variant="secondary" tone="danger">
          Report a fault
        </ActionButton>
      )
    case 'faulty':
      return null
  }
}
