import { useState, useRef, useLayoutEffect, useEffect } from 'react'

const MIN_FONT = 20
const MAX_FONT = 28
const MAX_COLS = 3
const STEP = 2
const DEBOUNCE_MS = 100
export const COLUMN_GAP_PX = 32
export { MAX_COLS }

export function useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly, songId }) {
  const [state, setState] = useState({
    fitFontSize: null,
    fitColumns: null,
    canIncrease: false,
    canDecrease: false,
    paginated: false,
    totalColumns: null,
    totalPages: 1,
    pageColWidth: null,
    fitAvailableHeight: null,
  })
  const shadowRef = useRef(null)
  const timerRef = useRef(null)
  const rafRef = useRef(null)
  const measureRef = useRef(null)
  const modeRef = useRef('auto')

  function getAvailableHeight() {
    const container = containerRef?.current
    const body = bodyRef?.current
    if (!container || !body) return null

    const containerRect = container.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const bodyTopInContainer = bodyRect.top - containerRect.top + container.scrollTop
    const availableHeight = container.clientHeight - bodyTopInContainer
    return availableHeight > 0 ? availableHeight : null
  }

  function getAvailableWidth() {
    const container = containerRef?.current
    if (!container) return null
    const width = container.clientWidth
    return width > 0 ? width : null
  }

  // For a fixed font size, find the smallest column count (1..MAX_COLS) whose
  // balanced-column height fits the available space. Returns null if none fit.
  function deriveColumnsForFont(fontSize, availableHeight) {
    const shadow = shadowRef?.current
    if (!shadow) return null

    shadow.style.height = 'auto'
    shadow.style.setProperty('--fit-fs', `${fontSize}px`)

    for (let cols = 1; cols <= MAX_COLS; cols++) {
      shadow.style.columnCount = cols
      const h = shadow.getBoundingClientRect().height
      if (h <= availableHeight) return cols
    }
    return null
  }

  // Re-measures the shadow in "flow" mode: fixed height, column-fill:auto (fills
  // each column top-to-bottom before starting the next, instead of balancing),
  // and width:max-content so the shadow is free to grow as wide as it needs
  // rather than being clipped to the visible pane. The resulting rendered width
  // tells us how many `colWidth`-wide columns the whole song needs.
  function measurePagination(fontSize, availableWidth, availableHeight) {
    const shadow = shadowRef?.current
    if (!shadow) return null
    const colWidth = (availableWidth - (MAX_COLS - 1) * COLUMN_GAP_PX) / MAX_COLS

    shadow.style.setProperty('--fit-fs', `${fontSize}px`)
    shadow.style.columnCount = ''
    shadow.style.columnWidth = `${colWidth}px`
    shadow.style.columnGap = `${COLUMN_GAP_PX}px`
    shadow.style.columnFill = 'auto'
    shadow.style.height = `${availableHeight}px`
    shadow.style.width = 'max-content'

    const measuredWidth = shadow.getBoundingClientRect().width
    const totalColumns = Math.max(1, Math.round(measuredWidth / (colWidth + COLUMN_GAP_PX)))
    const totalPages = Math.ceil(totalColumns / MAX_COLS)

    // Restore the shadow to its normal (balanced, height:auto) measurement mode
    // so the next single-page search isn't affected by leftover pagination styles.
    shadow.style.columnFill = ''
    shadow.style.width = ''
    shadow.style.columnWidth = ''
    shadow.style.columnGap = ''
    shadow.style.height = 'auto'

    return { totalColumns, totalPages, colWidth }
  }

  // Given an arbitrary font size, produce the full fit result for it: either a
  // normal single-page result (found via deriveColumnsForFont), or a paginated
  // result (via measurePagination) when nothing fits in <= MAX_COLS columns.
  // Shared by the auto search, manual +/-, and the resize handler so all three
  // treat "doesn't fit" the same way.
  function resultForFont(fontSize, availableWidth, availableHeight) {
    const cols = deriveColumnsForFont(fontSize, availableHeight)
    if (cols !== null) {
      return {
        fitFontSize: fontSize,
        fitColumns: cols,
        paginated: false,
        totalColumns: null,
        totalPages: 1,
        pageColWidth: null,
        fitAvailableHeight: null,
      }
    }
    const pagination = measurePagination(fontSize, availableWidth, availableHeight)
    if (pagination === null) return null
    return {
      fitFontSize: fontSize,
      fitColumns: MAX_COLS,
      paginated: true,
      totalColumns: pagination.totalColumns,
      totalPages: pagination.totalPages,
      pageColWidth: pagination.colWidth,
      fitAvailableHeight: availableHeight,
    }
  }

  function computeFlags(fontSize) {
    const canDecrease = fontSize > MIN_FONT
    const canIncrease = fontSize < MAX_FONT
    return { canIncrease, canDecrease }
  }

  measureRef.current = function measureAuto() {
    const availableHeight = getAvailableHeight()
    const availableWidth = getAvailableWidth()
    if (availableHeight === null || availableWidth === null) return

    let best = null
    const shadow = shadowRef?.current
    if (!shadow) return
    shadow.style.height = 'auto'

    for (let cols = 1; cols <= MAX_COLS; cols++) {
      shadow.style.columnCount = cols

      let lo = MIN_FONT
      let hi = MAX_FONT
      let colBest = null

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        shadow.style.setProperty('--fit-fs', `${mid}px`)
        const h = shadow.getBoundingClientRect().height
        if (h <= availableHeight) {
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

    let result
    if (best) {
      result = { ...best, paginated: false, totalColumns: null, totalPages: 1, pageColWidth: null, fitAvailableHeight: null }
    } else {
      const pagination = measurePagination(MIN_FONT, availableWidth, availableHeight)
      result = {
        fitFontSize: MIN_FONT,
        fitColumns: MAX_COLS,
        paginated: true,
        totalColumns: pagination.totalColumns,
        totalPages: pagination.totalPages,
        pageColWidth: pagination.colWidth,
        fitAvailableHeight: availableHeight,
      }
    }

    modeRef.current = 'auto'
    setState({ ...result, ...computeFlags(result.fitFontSize) })
  }

  function increaseFontSize() {
    setState(prev => {
      if (!prev.canIncrease || prev.fitFontSize === null) return prev
      const availableHeight = getAvailableHeight()
      const availableWidth = getAvailableWidth()
      if (availableHeight === null || availableWidth === null) return prev
      const nextFont = Math.min(prev.fitFontSize + STEP, MAX_FONT)
      modeRef.current = 'manual'
      const result = resultForFont(nextFont, availableWidth, availableHeight)
      if (result === null) return prev
      return { ...result, ...computeFlags(result.fitFontSize) }
    })
  }

  function decreaseFontSize() {
    setState(prev => {
      if (!prev.canDecrease || prev.fitFontSize === null) return prev
      const availableHeight = getAvailableHeight()
      const availableWidth = getAvailableWidth()
      if (availableHeight === null || availableWidth === null) return prev
      const nextFont = Math.max(prev.fitFontSize - STEP, MIN_FONT)
      modeRef.current = 'manual'
      const result = resultForFont(nextFont, availableWidth, availableHeight)
      if (result === null) return prev
      return { ...result, ...computeFlags(result.fitFontSize) }
    })
  }

  // Re-measure when enabled state, lyricsOnly, or the active song changes.
  // Song changes must force a fresh auto-fit rather than keep a manually
  // pinned font size, since a size that fit the previous song's content may
  // not fit (or may under-fill) the new song's.
  useLayoutEffect(() => {
    if (!enabled) {
      setState({
        fitFontSize: null, fitColumns: null, canIncrease: false, canDecrease: false,
        paginated: false, totalColumns: null, totalPages: 1, pageColWidth: null, fitAvailableHeight: null,
      })
      return
    }
    modeRef.current = 'auto'
    measureRef.current()
    // Guard against transitional layout on the very first pass (e.g. a freshly
    // mounted `fixed inset-0` overlay tree). Re-measure once a full layout+paint
    // cycle has actually completed, and correct the result if it changed.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => measureRef.current())
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, lyricsOnly, songId])

  // ResizeObserver: re-measure on container size changes (debounced).
  // In manual mode, keep the user's pinned font and only re-derive columns;
  // in auto mode, re-run the full auto-fit search as before.
  useEffect(() => {
    if (!enabled || !containerRef?.current) return
    const el = containerRef.current
    const observer = new ResizeObserver(() => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (modeRef.current === 'manual') {
          setState(prev => {
            if (prev.fitFontSize === null) return prev
            const availableHeight = getAvailableHeight()
            const availableWidth = getAvailableWidth()
            if (availableHeight === null || availableWidth === null) return prev
            const result = resultForFont(prev.fitFontSize, availableWidth, availableHeight)
            if (result === null) return prev
            return { ...result, ...computeFlags(result.fitFontSize) }
          })
        } else {
          measureRef.current()
        }
      }, DEBOUNCE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timerRef.current)
    }
  }, [enabled])

  return {
    fitFontSize: state.fitFontSize,
    fitColumns: state.fitColumns,
    paginated: state.paginated,
    totalColumns: state.totalColumns,
    totalPages: state.totalPages,
    pageColWidth: state.pageColWidth,
    fitAvailableHeight: state.fitAvailableHeight,
    canIncrease: state.canIncrease,
    canDecrease: state.canDecrease,
    increaseFontSize,
    decreaseFontSize,
    shadowRef,
  }
}
