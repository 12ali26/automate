'use client'

import { useState, useTransition } from 'react'

import { Callout } from '@/components/manage/ui'

import { saveTemplateAction } from '../actions'

type Item = { key: string; id: string | null; label: string; blocking: boolean }

let seq = 0
const freshKey = () => `new-${seq++}`

/**
 * Template editor: name, active toggle, and an ordered list of items with
 * up/down reordering, a per-item "blocking" toggle and add/remove. The whole
 * list is sent on save; the server reconciles it (insert / update / remove,
 * soft-deleting any removed item that already has responses). On success the
 * server's canonical item list is read back so new rows pick up their ids and a
 * second save does not duplicate them.
 */
export function TemplateEditor({
  orgSlug,
  templateId,
  initialName,
  initialActive,
  initialItems,
}: {
  orgSlug: string
  templateId: string
  initialName: string
  initialActive: boolean
  initialItems: { id: string; label: string; blocking: boolean }[]
}) {
  const [name, setName] = useState(initialName)
  const [active, setActive] = useState(initialActive)
  const [items, setItems] = useState<Item[]>(
    initialItems.map((it) => ({ key: it.id, id: it.id, label: it.label, blocking: it.blocking })),
  )
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  const patch = (key: string, next: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...next } : it)))

  const move = (index: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })

  const remove = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key))

  const addItem = () =>
    setItems((prev) => [...prev, { key: freshKey(), id: null, label: '', blocking: false }])

  const save = () => {
    setMessage(null)
    const trimmed = items.map((it) => ({ ...it, label: it.label.trim() }))
    if (trimmed.some((it) => it.label.length === 0)) {
      setMessage({ tone: 'error', text: 'Every item needs a label. Remove blank rows or fill them in.' })
      return
    }
    startTransition(async () => {
      const res = await saveTemplateAction(orgSlug, templateId, {
        name: name.trim(),
        active,
        items: trimmed.map((it) => ({ id: it.id ?? '', label: it.label, blocking: it.blocking })),
      })
      if (res.ok) {
        setItems(
          res.items.map((it) => ({ key: it.id, id: it.id, label: it.label, blocking: it.blocking })),
        )
        setMessage({ tone: 'success', text: 'Saved.' })
      } else {
        setMessage({ tone: 'error', text: res.error })
      }
    })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        Template name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-900"
        />
      </label>

      <label className="flex items-start gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <span className="flex flex-col">
          Active
          <span className="text-xs font-normal text-gray-500">
            An inactive template can no longer be attached to a machine. Existing attachments keep working.
          </span>
        </span>
      </label>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-gray-950">Items</h2>
          <span className="text-xs text-gray-500">
            A failed <strong>blocking</strong> item stops the checkout; a non-blocking item only records a note.
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li
              key={it.key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="px-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label="Move down"
                  className="px-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <input
                value={it.label}
                onChange={(e) => patch(it.key, { label: e.target.value })}
                placeholder="e.g. Power cable undamaged"
                maxLength={200}
                className="min-w-[12rem] flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-900"
              />
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={it.blocking}
                  onChange={(e) => patch(it.key, { blocking: e.target.checked })}
                />
                Blocking
              </label>
              <button
                type="button"
                onClick={() => remove(it.key)}
                className="text-sm font-semibold text-red-700 underline hover:text-red-800"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={addItem}
          className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Add item
        </button>
      </div>

      {message ? <Callout tone={message.tone}>{message.text}</Callout> : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save template'}
        </button>
        <span className="text-xs text-gray-500">
          Removing an item that appears in past checkouts hides it from new checklists but keeps old records readable.
        </span>
      </div>
    </div>
  )
}
