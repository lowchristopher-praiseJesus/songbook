import { useRef, useCallback } from 'react'

const MIN_DISTANCE = 50      // px — minimum horizontal swipe length
const MAX_VERTICAL_RATIO = 0.6  // |dy/dx| must stay below this to count as horizontal

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight }) {
  const startRef = useRef(null)

  const onTouchStart = useCallback((e) => {
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY }
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (!startRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - startRef.current.x
    const dy = t.clientY - startRef.current.y
    startRef.current = null

    if (Math.abs(dx) < MIN_DISTANCE) return
    if (Math.abs(dy) / Math.abs(dx) > MAX_VERTICAL_RATIO) return  // mostly vertical = scroll, ignore

    if (dx < 0) onSwipeLeft?.()
    else onSwipeRight?.()
  }, [onSwipeLeft, onSwipeRight])

  return { onTouchStart, onTouchEnd }
}
