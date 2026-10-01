import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Shows a "new version available" banner. The new service worker waits until
 * the user taps Reload, so a deploy never replaces code mid-song.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 px-4 py-3 shadow-lg text-sm"
    >
      <span>A new version of SongSheet is available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="rounded bg-indigo-500 px-3 py-1 font-medium text-white hover:bg-indigo-400"
      >
        Reload
      </button>
      <button onClick={() => setNeedRefresh(false)} className="opacity-70 hover:opacity-100">
        Later
      </button>
    </div>
  )
}
