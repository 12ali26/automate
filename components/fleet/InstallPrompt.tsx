'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'automate:install-dismissed'

/**
 * A dismissible "add to home screen" banner on the fleet page. This is what
 * turns the app from "a thing you scan" into "a thing you open".
 *
 * - Android / Chrome: captures the `beforeinstallprompt` event and offers a
 *   real install button.
 * - iOS Safari: no prompt API, so show the manual Share -> Add to Home Screen
 *   steps instead.
 * - Hidden once installed (standalone display mode) or once dismissed
 *   (remembered in localStorage).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setMounted(true)

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    let stored = false
    try {
      stored = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      stored = false
    }
    setDismissed(stored)

    const ua = navigator.userAgent || ''
    setIsIOS(/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua))

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode — banner just reappears next load */
    }
    setDismissed(true)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    try {
      await deferred.userChoice
    } catch {
      /* ignore */
    }
    dismiss()
  }

  if (!mounted || dismissed) return null
  // Nothing to offer: not iOS, and Chrome hasn't fired the install event.
  if (!isIOS && !deferred) return null

  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-300 bg-gray-50 p-3">
      <div className="flex-1 text-sm text-gray-700">
        <p className="font-semibold text-gray-900">Add to home screen</p>
        {isIOS && !deferred ? (
          <p className="mt-0.5">
            Tap the Share button, then <strong>Add to Home Screen</strong>.
          </p>
        ) : (
          <p className="mt-0.5">Open the fleet like an app — one tap from your home screen.</p>
        )}
        {deferred ? (
          <button
            type="button"
            onClick={install}
            className="mt-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white active:bg-gray-700"
          >
            Add to home screen
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-gray-500 active:bg-gray-200"
      >
        &times;
      </button>
    </div>
  )
}
