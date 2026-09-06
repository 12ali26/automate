import type { ReactNode } from 'react'

/**
 * Primary / secondary action buttons for the machine page.
 *
 * Stage 3 is read-only: every button renders at full visual fidelity but does
 * nothing (`aria-disabled`, no handler). The checkout / check-in flows are
 * Stage 4.
 *
 * - primary: ~56px tall, full width, in the thumb zone
 * - secondary: a quiet neutral control — grey, no underline, still a 44px tap
 *   target. "Report a fault" is a legitimate secondary action, not a warning,
 *   so it must not read as red/destructive.
 */
export function ActionButton({
  children,
  variant,
}: {
  children: ReactNode
  variant: 'primary' | 'secondary'
}) {
  if (variant === 'primary') {
    return (
      <button
        type="button"
        aria-disabled="true"
        tabIndex={-1}
        className="w-full min-h-14 cursor-not-allowed select-none rounded-xl bg-gray-950 px-6 text-center text-xl font-bold text-white"
      >
        {children}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-disabled="true"
      tabIndex={-1}
      className="w-full min-h-11 cursor-not-allowed select-none rounded-lg px-4 py-2 text-center text-base font-semibold text-gray-600 active:bg-gray-100"
    >
      {children}
    </button>
  )
}
