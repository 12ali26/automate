import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Primary / secondary action buttons for the machine page.
 *
 * With an `href` the control is a real link into a machine flow (check out,
 * check in, report a fault). Without one it renders at full visual fidelity but
 * does nothing (`aria-disabled`, no handler).
 *
 * - primary: ~56px tall, full width, in the thumb zone
 * - secondary: a quiet neutral control — grey, no underline, still a 44px tap
 *   target. "Report a fault" is a legitimate secondary action, not a warning,
 *   so it must not read as red/destructive.
 */
export function ActionButton({
  children,
  variant,
  href,
}: {
  children: ReactNode
  variant: 'primary' | 'secondary'
  href?: string
}) {
  const primaryClass =
    'w-full min-h-14 rounded-xl bg-gray-950 px-6 text-center text-xl font-bold text-white'
  const secondaryClass =
    'w-full min-h-11 rounded-lg px-4 py-2 text-center text-base font-semibold text-gray-600'
  const className = variant === 'primary' ? primaryClass : secondaryClass

  if (href) {
    return (
      <Link
        href={href}
        className={`${className} flex items-center justify-center select-none ${
          variant === 'primary' ? 'active:bg-gray-800' : 'active:bg-gray-100'
        }`}
      >
        {children}
      </Link>
    )
  }

  return (
    <button
      type="button"
      aria-disabled="true"
      tabIndex={-1}
      className={`${className} cursor-not-allowed select-none ${
        variant === 'secondary' ? 'active:bg-gray-100' : ''
      }`}
    >
      {children}
    </button>
  )
}
