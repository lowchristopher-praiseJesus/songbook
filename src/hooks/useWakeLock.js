import { useEffect } from 'react'

/**
 * Hold a screen wake lock while `active` is true, so the device doesn't
 * dim/sleep mid-song (Performance mode, auto-scroll).
 *
 * The browser auto-releases the lock whenever the tab is hidden, so the hook
 * re-acquires it on visibilitychange. Silently does nothing where the Wake
 * Lock API is unsupported or the request is denied (e.g. battery saver).
 */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return

    let sentinel = null
    let cancelled = false

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          lock.release().catch(() => {})
        } else {
          sentinel = lock
        }
      } catch {
        // Request denied — carry on without a lock.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      sentinel?.release().catch(() => {})
    }
  }, [active])
}
