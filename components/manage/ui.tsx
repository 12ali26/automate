'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Shared building blocks for the manager admin screens (Stage 7B) so every
 * page uses the same table, form field and button rather than hand-rolling one.
 * Desktop-first; these are low-frequency admin actions, so no optimistic UI.
 */

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success'
  children: ReactNode
}) {
  const cls = {
    info: 'border-gray-200 bg-gray-50 text-gray-700',
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-green-200 bg-green-50 text-green-800',
  }[tone]
  return (
    <p role={tone === 'error' ? 'alert' : undefined} className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  )
}

export function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  autoFocus,
  placeholder,
  hint,
  error,
}: {
  label: string
  name: string
  defaultValue?: string
  type?: string
  required?: boolean
  autoFocus?: boolean
  placeholder?: string
  hint?: string
  error?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
      {label}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`rounded-lg border px-3 py-2 text-base text-gray-950 outline-none focus:border-gray-900 ${
          error ? 'border-red-400' : 'border-gray-300'
        }`}
      />
      {hint ? <span className="text-xs font-normal text-gray-500">{hint}</span> : null}
      {error ? <span className="text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  )
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  placeholder,
  hint,
}: {
  label: string
  name: string
  defaultValue?: string
  options: { value: string; label: string }[]
  placeholder?: string
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ''}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-950 outline-none focus:border-gray-900"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs font-normal text-gray-500">{hint}</span> : null}
    </label>
  )
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string
  name: string
  defaultChecked?: boolean
  hint?: string
}) {
  return (
    <label className="flex items-start gap-2 text-sm font-medium text-gray-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-gray-300"
      />
      <span className="flex flex-col">
        {label}
        {hint ? <span className="text-xs font-normal text-gray-500">{hint}</span> : null}
      </span>
    </label>
  )
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
}: {
  children: ReactNode
  pendingLabel?: string
  variant?: 'primary' | 'danger' | 'ghost'
}) {
  const { pending } = useFormStatus()
  const cls = {
    primary: 'bg-gray-950 text-white hover:bg-gray-800',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
  }[variant]
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${cls}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}

export function Table({
  head,
  children,
  empty,
  isEmpty,
}: {
  head: ReactNode[]
  children?: ReactNode
  empty: string
  isEmpty: boolean
}) {
  if (isEmpty) {
    return <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">{empty}</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

export function StatusPill({ status }: { status: 'available' | 'checked_out' | 'faulty' }) {
  const map = {
    available: 'bg-green-100 text-green-800',
    checked_out: 'bg-blue-100 text-blue-800',
    faulty: 'bg-red-100 text-red-800',
  }
  const label = { available: 'Available', checked_out: 'Checked out', faulty: 'Faulty' }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {label[status]}
    </span>
  )
}

export function InactiveTag() {
  return (
    <span className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
      Inactive
    </span>
  )
}
