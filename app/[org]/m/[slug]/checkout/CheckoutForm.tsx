'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

import type { ChecklistItem } from '@/lib/domain/types'
import { checkOutAction } from '@/lib/machine/actions'
import type { CheckOutFailure } from '@/lib/machine/checkout'

type Answer = 'pass' | 'fail'

const FAILURE_MESSAGE: Record<CheckOutFailure, string> = {
  taken: 'Someone just took this machine.',
  faulty: 'This machine has been marked out of service.',
  blocking: 'A safety-critical check failed, so this machine can’t be taken out.',
  'not-found': 'This machine is no longer available.',
  invalid: 'Something went wrong with that submission. Please try again.',
}

export function CheckoutForm({
  orgSlug,
  slug,
  items,
  backHref,
}: {
  orgSlug: string
  slug: string
  items: ChecklistItem[]
  backHref: string
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<CheckOutFailure | null>(null)
  const [pending, startTransition] = useTransition()

  const answeredCount = useMemo(
    () => items.filter((i) => answers[i.id]).length,
    [items, answers],
  )
  const allAnswered = answeredCount === items.length
  const showProgress = items.length > 5

  function submit() {
    if (!allAnswered || pending) return
    setFailure(null)
    const payload = {
      responses: items.map((i) => ({
        itemId: i.id,
        passed: answers[i.id] === 'pass',
        note: notes[i.id]?.trim() ? notes[i.id].trim() : null,
      })),
    }
    startTransition(async () => {
      const result = await checkOutAction(orgSlug, slug, payload)
      // A successful checkout redirects server-side; only failures return here.
      if (result && !result.ok) setFailure(result.reason)
    })
  }

  return (
    <form
      className="flex flex-1 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {items.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-base text-gray-700">
          This machine has no checklist. Confirm below to take it out.
        </p>
      ) : (
        <>
          {showProgress ? (
            <p className="text-sm font-semibold text-gray-600" aria-live="polite">
              {answeredCount} of {items.length}
            </p>
          ) : null}
          <ol className="flex flex-col gap-4">
            {items.map((item, index) => (
              <li key={item.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-lg font-semibold text-gray-950">
                    {showProgress ? `${index + 1}. ` : ''}
                    {item.label}
                  </span>
                  {item.blocking ? (
                    <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">
                      Must pass
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['pass', 'fail'] as const).map((choice) => {
                    const selected = answers[item.id] === choice
                    const base =
                      'min-h-14 rounded-xl border-2 text-lg font-bold uppercase tracking-wide select-none'
                    const on =
                      choice === 'pass'
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-red-600 bg-red-600 text-white'
                    const off = 'border-gray-300 bg-white text-gray-600 active:bg-gray-100'
                    return (
                      <button
                        key={choice}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [item.id]: choice }))
                        }
                        className={`${base} ${selected ? on : off}`}
                      >
                        {choice === 'pass' ? 'Pass' : 'Fail'}
                      </button>
                    )
                  })}
                </div>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="Add a note (optional)"
                  value={notes[item.id] ?? ''}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-900"
                />
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="flex-1" />

      {failure ? (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-600 bg-red-50 p-4 text-base font-semibold text-red-950"
        >
          <p>{FAILURE_MESSAGE[failure]}</p>
          {failure === 'blocking' ? (
            <p className="mt-1 font-normal">
              Go back and report a fault instead.
            </p>
          ) : null}
          <Link href={backHref} className="mt-2 inline-block font-bold underline">
            Back to machine
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 pb-1">
        <button
          type="submit"
          disabled={!allAnswered || pending}
          className="w-full min-h-14 rounded-xl bg-gray-950 px-6 text-center text-xl font-bold text-white active:bg-gray-800 disabled:opacity-40"
        >
          {pending ? 'Checking out…' : 'Confirm checkout'}
        </button>
        <Link
          href={backHref}
          className="w-full min-h-11 rounded-lg px-4 py-2 text-center text-base font-semibold text-gray-600 active:bg-gray-100"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
