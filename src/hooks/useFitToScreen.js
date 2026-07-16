import { useState, useRef, useLayoutEffect, useEffect } from 'react'

const MAX_FONT = 28
const MAX_COLS = 3
const STEP = 2
const DEBOUNCE_MS = 100
export const COLUMN_GAP_PX = 32
export { MAX_COLS }

export function useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly, songId, minFontSize }) {
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
    settled: false,
    songId: null,
  })
  const shadowRef = useRef(null)
  const timerRef = useRef(null)
  const rafRef = useRef(null)
  const measureRef = useRef(null)
  const modeRef = useRef('auto')
  // Tracks the current songId prop for use inside callbacks/closures that
  // don't re-run on every songId change (measureAuto is reassigned every
  // render so it's fine, but increaseFontSize/decreaseFontSize and the
  // ResizeObserver effect's closure are not — they'd otherwise tag state
  // updates with a stale songId after a song switch). Updated unconditionally
  // on every render, before any effect runs.
  const songIdRef = useRef(songId)
  songIdRef.current = songId

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

    // The shadow always renders SongBody's plain (non-paginated) branch, whose
    // root is a `py-4` div (16px top + 16px bottom padding) wrapping the
    // multicol content. CSS multicol fragmentation applies an element's own
    // padding once across the whole fragmented flow (top padding before the
    // first line, bottom padding after the last) — NOT once per column — so
    // that 32px is a one-time tax on the fixed-height column budget being
    // measured here. The live paginated render (SongBody's dedicated
    // paginated branch) has no such wrapper: sections are direct children of
    // the flow, with zero internal padding. Left unaccounted for, this
    // measured-vs-rendered structural mismatch makes the measurement need
    // more columns than the live render actually uses, producing an empty
    // trailing page and content that visually overflows near a column's
    // right edge. Neutralize the wrapper's padding on the shadow before
    // measuring so what's measured matches what's rendered.
    const innerWrapper = shadow.firstElementChild
    const prevInnerPadding = innerWrapper ? innerWrapper.style.padding : null
    if (innerWrapper) innerWrapper.style.padding = '0px'

    shadow.style.setProperty('--fit-fs', `${fontSize}px`)
    shadow.style.columnCount = ''
    shadow.style.columnWidth = `${colWidth}px`
    shadow.style.columnGap = `${COLUMN_GAP_PX}px`
    shadow.style.columnFill = 'auto'
    shadow.style.height = `${availableHeight}px`
    // Constrain the shadow to a single column's width. With column-fill:auto and
    // a fixed height, the content then overflows into as many columns as it needs
    // beyond that one-column box, and `scrollWidth` reports the full laid-out
    // content width (every column, including the overflow). `width: max-content`
    // does NOT work here: on a multicol container it resolves to ~one column's
    // intrinsic width, not the full content width, so it dramatically
    // underreports and the song never paginates (the user sees one clipped page
    // and swiping crosses to the next song). Verified empirically in a real
    // browser — jsdom can't exercise this since it doesn't do layout, so the
    // unit-test mocks simulate `scrollWidth` instead.
    shadow.style.width = `${colWidth}px`

    const measuredWidth = shadow.scrollWidth
    // scrollWidth = N*colWidth + (N-1)*gap for N columns; invert to recover N.
    const totalColumns = Math.max(1, Math.round((measuredWidth + COLUMN_GAP_PX) / (colWidth + COLUMN_GAP_PX)))
    const totalPages = Math.ceil(totalColumns / MAX_COLS)

    // Restore the shadow to its normal (balanced, height:auto) measurement mode
    // so the next single-page search isn't affected by leftover pagination styles.
    shadow.style.columnFill = ''
    shadow.style.width = ''
    shadow.style.columnWidth = ''
    shadow.style.columnGap = ''
    shadow.style.height = 'auto'
    if (innerWrapper) innerWrapper.style.padding = prevInnerPadding

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
    const canDecrease = fontSize > minFontSize
    const canIncrease = fontSize < MAX_FONT
    return { canIncrease, canDecrease }
  }

  measureRef.current = function measureAuto(settled = true) {
    const availableHeight = getAvailableHeight()
    const availableWidth = getAvailableWidth()
    if (availableHeight === null || availableWidth === null) return

    let best = null
    const shadow = shadowRef?.current
    if (!shadow) return
    shadow.style.height = 'auto'

    for (let cols = 1; cols <= MAX_COLS; cols++) {
      shadow.style.columnCount = cols

      let lo = minFontSize
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
      const pagination = measurePagination(minFontSize, availableWidth, availableHeight)
      result = {
        fitFontSize: minFontSize,
        fitColumns: MAX_COLS,
        paginated: true,
        totalColumns: pagination.totalColumns,
        totalPages: pagination.totalPages,
        pageColWidth: pagination.colWidth,
        fitAvailableHeight: availableHeight,
      }
    }

    modeRef.current = 'auto'
    setState({ ...result, ...computeFlags(result.fitFontSize), settled, songId: songIdRef.current })
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
      return { ...result, ...computeFlags(result.fitFontSize), settled: true, songId: songIdRef.current }
    })
  }

  function decreaseFontSize() {
    setState(prev => {
      if (!prev.canDecrease || prev.fitFontSize === null) return prev
      const availableHeight = getAvailableHeight()
      const availableWidth = getAvailableWidth()
      if (availableHeight === null || availableWidth === null) return prev
      const nextFont = Math.max(prev.fitFontSize - STEP, minFontSize)
      modeRef.current = 'manual'
      const result = resultForFont(nextFont, availableWidth, availableHeight)
      if (result === null) return prev
      return { ...result, ...computeFlags(result.fitFontSize), settled: true, songId: songIdRef.current }
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
        settled: false, songId: null,
      })
      return
    }
    modeRef.current = 'auto'
    // The synchronous first pass may run against transitional layout (e.g. a
    // freshly mounted `fixed inset-0` overlay tree), so it's reported as
    // unsettled. Re-measure once a full layout+paint cycle has actually
    // completed, and correct the result if it changed — that second pass is
    // the settled one consumers can rely on for anything timing-sensitive.
    measureRef.current(false)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => measureRef.current(true))
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, lyricsOnly, songId, minFontSize])

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
            return { ...result, ...computeFlags(result.fitFontSize), settled: true, songId: songIdRef.current }
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
    settled: state.settled,
    measuredSongId: state.songId,
  }
}
