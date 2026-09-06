import type { ReactNode } from 'react'

/**
 * Primary / secondary action buttons for the machine page.
 *
 * Stage 3 is read-only: every button renders at full visual fidelity but does
 * nothing (`aria-disabled`, no handler). The checkout / check-in flows are
 * Stage 4.
 *
 * Sizing follows the mobile-first budget: primary ~56px tall and full width in
 * the thumb zone; secondary a quiet text-weight control, still 44px tall.
 */
export function ActionButton({
  children,
  variant,
  tone = 'default',
}: {
  children: ReactNode
  variant: 'primary' | 'secondary'
  tone?: 'default' | 'danger'
}) {
  const common = 'w-full select-none rounded-xl text-center font-bold cursor-not-allowed'

  if (variant === 'primary') {
    const toneClass =
      tone === 'danger' ? 'bg-red-600 text-white' : 'bg-gray-950 text-white'
    return (
      <button
        type="button"
        aria-disabled="true"
        tabIndex={-1}
        className={`${common} min-h-14 px-6 text-xl ${toneClass}`}
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
      className={`${common} min-h-11 px-4 py-2 text-lg underline underline-offset-4 ${
        tone === 'danger' ? 'text-red-700' : 'text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}
