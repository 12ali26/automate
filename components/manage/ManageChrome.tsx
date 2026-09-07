'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * The shared frame for every signed-in manager screen: facility name, the
 * section nav, the signed-in manager and a sign-out control. Desktop-first.
 * The login page (/{org}/manage) does NOT use this — it has no session yet.
 */
const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'machines', label: 'Machines' },
  { key: 'locations', label: 'Locations' },
  { key: 'templates', label: 'Checklists' },
] as const

export function ManageChrome({
  orgSlug,
  orgName,
  managerName,
  signOutAction,
  children,
}: {
  orgSlug: string
  orgName: string
  managerName: string
  signOutAction: () => void | Promise<void>
  children: ReactNode
}) {
  const pathname = usePathname() ?? ''
  const base = `/${orgSlug}/manage`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {orgName}
            </span>
            <span className="text-sm font-bold text-gray-950">Manage</span>
          </div>
          <form action={signOutAction} className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{managerName}</span>
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Sign out
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-2 md:px-6">
          {SECTIONS.map((s) => {
            const href = `${base}/${s.key}`
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={s.key}
                href={href}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
                  active
                    ? 'border-gray-950 text-gray-950'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {s.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
    </div>
  )
}

export function PageHead({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">{title}</h1>
        {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
