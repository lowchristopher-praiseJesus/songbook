import { useState, useRef, useLayoutEffect, useEffect } from 'react'

const MIN_FONT = 10
const MAX_FONT = 28
const MAX_COLS = 4
const DEBOUNCE_MS = 100

export function useFitToScreen({ enabled, containerRef, headerRef, lyricsOnly }) {
  const [result, setResult] = useState({ fitFontSize: null, fitColumns: null })
  const shadowRef = useRef(null)
  const timerRef = useRef(null)

  function measure() {
    const container = containerRef?.current
    const header = headerRef?.current
    const shadow = shadowRef?.current
    if (!container || !header || !shadow) return

    const availableHeight = container.clientHeight - header.offsetHeight
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
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lyricsOnly])

  // ResizeObserver: re-measure on container size changes (debounced)
  useEffect(() => {
    if (!enabled || !containerRef?.current) return
    const el = containerRef.current
    const observer = new ResizeObserver(() => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(measure, DEBOUNCE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return { fitFontSize: result.fitFontSize, fitColumns: result.fitColumns, shadowRef }
}
