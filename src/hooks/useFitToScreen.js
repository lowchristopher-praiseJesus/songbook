import { useState, useRef, useLayoutEffect, useEffect } from 'react'

const MIN_FONT = 10
const MAX_FONT = 28
const MAX_COLS = 4
const DEBOUNCE_MS = 100

export function useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly }) {
  const [result, setResult] = useState({ fitFontSize: null, fitColumns: null })
  const shadowRef = useRef(null)
  const timerRef = useRef(null)
  const measureRef = useRef(null)

  measureRef.current = function measure() {
    const container = containerRef?.current
    const body = bodyRef?.current
    const shadow = shadowRef?.current
    if (!container || !body || !shadow) return

    const containerRect = container.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    // Absolute offset of body from container top (scroll-independent)
    const bodyTopInContainer = bodyRect.top - containerRect.top + container.scrollTop
    const availableHeight = container.clientHeight - bodyTopInContainer
    if (availableHeight <= 0) return

    let best = null

    for (let cols = 1; cols <= MAX_COLS; cols++) {
      shadow.style.columnCount = cols
      shadow.style.height = `${availableHeight}px`

      let lo = MIN_FONT
      let hi = MAX_FONT
      let colBest = null

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        shadow.style.setProperty('--fit-fs', `${mid}px`)
        // Force synchronous layout reflow so scrollHeight is accurate
        void shadow.offsetHeight
        if (shadow.scrollHeight <= shadow.clientHeight) {
          colBest = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }

      if (colBest !== null) {
        best = { fitFontSize: colBest, fitColumns: cols }
        break
      }
    }

    setResult(best ?? { fitFontSize: MIN_FONT, fitColumns: MAX_COLS })
  }

  // Re-measure when enabled state or lyricsOnly changes
  useLayoutEffect(() => {
    if (!enabled) {
      setResult({ fitFontSize: null, fitColumns: null })
      return
    }
    measureRef.current()
  }, [enabled, lyricsOnly])

  // ResizeObserver: re-measure on container size changes (debounced)
  useEffect(() => {
    if (!enabled || !containerRef?.current) return
    const el = containerRef.current
    const observer = new ResizeObserver(() => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => measureRef.current(), DEBOUNCE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timerRef.current)
    }
  }, [enabled])

  return { fitFontSize: result.fitFontSize, fitColumns: result.fitColumns, shadowRef }
}
