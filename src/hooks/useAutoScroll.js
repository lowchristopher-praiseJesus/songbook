import { useState, useEffect, useRef, useCallback } from 'react'

export function useAutoScroll(containerRef, targetDuration) {
  const [isScrolling, setIsScrolling] = useState(false)
  const rafRef = useRef(null)
  const pxPerFrameRef = useRef(0)

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsScrolling(false)
  }, [])

  // tickRef holds the latest tick function so the rAF loop always sees
  // the current pxPerFrameRef and stop without stale closure issues.
  const tickRef = useRef(null)
  tickRef.current = function tick() {
    const el = containerRef.current
    if (!el || rafRef.current === null) return
    el.scrollTop += pxPerFrameRef.current
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
      stop()
      return
    }
    rafRef.current = requestAnimationFrame(tickRef.current)
  }

  const start = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const scrollable = el.scrollHeight - el.clientHeight
    if (scrollable <= 0) return
    pxPerFrameRef.current = scrollable / (targetDuration * 60)
    setIsScrolling(true)
    rafRef.current = requestAnimationFrame(tickRef.current)
  }, [containerRef, targetDuration])

  // Recalculate speed immediately when targetDuration changes mid-scroll
  useEffect(() => {
    if (!isScrolling) return
    const el = containerRef.current
    if (!el) return
    pxPerFrameRef.current = (el.scrollHeight - el.clientHeight) / (targetDuration * 60)
  }, [targetDuration, isScrolling, containerRef])

  // Cleanup on unmount
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  return { isScrolling, start, stop }
}
