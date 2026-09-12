import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('install-banner-dismissed') === '1')
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (isStandalone() || dismissed || (!deferred && !isIos())) return null

  function dismiss() {
    sessionStorage.setItem('install-banner-dismissed', '1')
    setDismissed(true)
  }

  async function install() {
    if (!deferred) {
      setShowIosHint(true)
      return
    }
    await deferred.prompt()
    setDeferred(null)
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs text-slate-600 dark:text-slate-300">Install PDF Toolkit for one-tap, offline access.</p>
        <div className="flex shrink-0 gap-2">
          <button onClick={dismiss} className="rounded-lg px-2 py-1.5 text-xs text-slate-400">
            Later
          </button>
          <button onClick={install} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">
            Install
          </button>
        </div>
      </div>

      {showIosHint && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setShowIosHint(false)}>
          <div className="w-full rounded-t-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">Add to Home Screen</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>
                Tap the <b>Share</b> icon in Safari's toolbar.
              </li>
              <li>
                Scroll down and tap <b>Add to Home Screen</b>.
              </li>
              <li>
                Tap <b>Add</b> — the app icon will appear on your home screen.
              </li>
            </ol>
            <button onClick={() => setShowIosHint(false)} className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
