export type BadgeState = 'available' | 'out' | 'faulty'

const STYLES: Record<BadgeState, string> = {
  available: 'bg-green-200 text-green-950',
  out: 'bg-blue-200 text-blue-950',
  faulty: 'bg-red-600 text-white',
}

const LABELS: Record<BadgeState, string> = {
  available: 'Available',
  out: 'Checked out',
  faulty: 'Faulty',
}

export function StateBadge({ state }: { state: BadgeState }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-4 py-1.5 text-base font-bold uppercase tracking-wide ${STYLES[state]}`}
    >
      {LABELS[state]}
    </span>
  )
}
