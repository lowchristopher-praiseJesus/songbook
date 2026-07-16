import { useCallback, useEffect, useState } from 'react'

function supportsFullscreen() {
  return typeof document !== 'undefined'
    && typeof document.documentElement.requestFullscreen === 'function'
    && document.fullscreenEnabled !== false
}

export function useNativeFullscreen({ active, onExit }) {
  const [isSupported] = useState(supportsFullscreen)

  const requestFullscreen = useCallback(() => {
    if (!isSupported) return
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
  }, [isSupported])

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!active) return
    function handleFullscreenChange() {
      if (!document.fullscreenElement) onExit?.()
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [active, onExit])

  return { isSupported, requestFullscreen, exitFullscreen }
}
