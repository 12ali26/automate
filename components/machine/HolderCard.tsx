/**
 * Who currently holds a checked-out machine and for how long. For state 3
 * (someone else has it) this is the single most confusion-preventing thing on
 * the screen: you walked down, the machine is gone, you scan, you see who has
 * it.
 */
export function HolderCard({
  holder,
  duration,
  sinceLabel,
}: {
  /** Full name, or null when it's the current user. */
  holder: string | null
  duration: string
  sinceLabel: string
}) {
  const you = holder === null
  return (
    <div
      className={`rounded-xl border p-4 ${
        you ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-100'
      }`}
    >
      <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
        {you ? 'You have this' : 'Checked out by'}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-gray-950 break-words">
        {you ? 'You' : holder}
      </p>
      <p className="mt-2 text-lg text-gray-800">
        for <span className="font-bold">{duration}</span>
        <span className="text-gray-600"> · since {sinceLabel}</span>
      </p>
    </div>
  )
}
