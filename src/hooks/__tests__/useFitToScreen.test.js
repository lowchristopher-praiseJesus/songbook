import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFitToScreen } from '../useFitToScreen'

function makeContainerRef(clientHeight = 400, clientWidth = 900) {
  return { current: { clientHeight, clientWidth, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) } }
}

function makeBodyRef(offsetTop = 80) {
  return { current: { getBoundingClientRect: () => ({ top: offsetTop }) } }
}

// Creates a mock shadow element whose getBoundingClientRect height reports fitting or not
function makeShadowEl({ fits = true } = {}) {
  const el = {
    style: {
      columnCount: 1,
      height: '',
      setProperty: vi.fn(),
    },
    getBoundingClientRect: () => ({ height: fits ? 0 : 9999 }),
  }
  return el
}

// A mock shadow whose reported height depends on the currently-set --fit-fs value,
// so tests can simulate "this exact font size fits at N columns" scenarios.
function makeFontAwareShadowEl({ fitsBelow } = { fitsBelow: 20 }) {
  let currentFont = 16
  const el = {
    style: {
      columnCount: 1,
      height: '',
      setProperty: vi.fn((prop, value) => {
        if (prop === '--fit-fs') currentFont = parseInt(value, 10)
      }),
    },
    getBoundingClientRect: () => ({ height: currentFont <= fitsBelow ? 0 : 9999 }),
  }
  return el
}

// A shadow that never fits a single page (height always 9999), and reports a
// width implying `totalColumns` columns once switched into pagination-measurement
// mode (columnCount cleared to '' and columnWidth set to a px string).
function makePaginatingShadowEl({ totalColumns = 7 } = {}) {
  const el = {
    style: {
      columnCount: 1,
      columnWidth: '',
      columnGap: '',
      columnFill: '',
      width: '',
      height: '',
      setProperty: vi.fn(),
    },
    getBoundingClientRect: () => {
      if (typeof el.style.columnCount === 'number') return { height: 9999, width: 0 }
      const colWidth = parseFloat(el.style.columnWidth) || 0
      return { height: 9999, width: totalColumns * (colWidth + 32) }
    },
  }
  return el
}

async function flushRaf() {
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => requestAnimationFrame(resolve))
  })
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', vi.fn(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
  })))
})

afterEach(() => vi.unstubAllGlobals())

describe('useFitToScreen', () => {
  it('returns null values when disabled', () => {
    const { result } = renderHook(() =>
      useFitToScreen({
        enabled: false,
        containerRef: makeContainerRef(),
        bodyRef: makeBodyRef(),
        lyricsOnly: false,
      })
    )
    expect(result.current.fitFontSize).toBeNull()
    expect(result.current.fitColumns).toBeNull()
  })

  it('exposes a shadowRef', () => {
    const { result } = renderHook(() =>
      useFitToScreen({
        enabled: false,
        containerRef: makeContainerRef(),
        bodyRef: makeBodyRef(),
        lyricsOnly: false,
      })
    )
    expect(result.current.shadowRef).toBeDefined()
  })

  it('returns fitFontSize and fitColumns when enabled and shadow fits at 1 column', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    // Populate the shadow ref before enabling
    result.current.shadowRef.current = makeShadowEl({ fits: true })

    act(() => rerender({ enabled: true }))

    expect(result.current.fitFontSize).toBeGreaterThan(0)
    expect(result.current.fitColumns).toBe(1)
  })

  it('resets to null when disabled after being enabled', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makeShadowEl({ fits: true })
    act(() => rerender({ enabled: true }))
    act(() => rerender({ enabled: false }))

    expect(result.current.fitFontSize).toBeNull()
    expect(result.current.fitColumns).toBeNull()
  })

  it('enters paginated mode with totalPages when nothing fits within 3 columns at 20px', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makePaginatingShadowEl({ totalColumns: 7 })
    act(() => rerender({ enabled: true }))

    expect(result.current.fitFontSize).toBe(20)
    expect(result.current.fitColumns).toBe(3)
    expect(result.current.paginated).toBe(true)
    expect(result.current.totalColumns).toBe(7)
    expect(result.current.totalPages).toBe(3) // ceil(7 / 3)
  })

  it('reports paginated:false and totalPages:1 for a normal single-page fit', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makeShadowEl({ fits: true })
    act(() => rerender({ enabled: true }))

    expect(result.current.paginated).toBe(false)
    expect(result.current.totalPages).toBe(1)
  })

  it('increaseFontSize keeps working (still allowed) while paginated', async () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makePaginatingShadowEl({ totalColumns: 7 })
    act(() => rerender({ enabled: true }))
    await flushRaf()

    expect(result.current.paginated).toBe(true)
    expect(result.current.canIncrease).toBe(true)

    act(() => result.current.increaseFontSize())
    expect(result.current.fitFontSize).toBe(22)
    expect(result.current.paginated).toBe(true)
  })

  it('sets up a ResizeObserver on the container when enabled', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()
    const observeSpy = vi.fn()
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: observeSpy, disconnect: vi.fn() })))

    renderHook(() =>
      useFitToScreen({ enabled: true, containerRef, bodyRef, lyricsOnly: false })
    )

    expect(observeSpy).toHaveBeenCalledWith(containerRef.current)
  })

  it('disconnects ResizeObserver on cleanup', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()
    const disconnectSpy = vi.fn()
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: disconnectSpy })))

    const { unmount } = renderHook(() =>
      useFitToScreen({ enabled: true, containerRef, bodyRef, lyricsOnly: false })
    )

    unmount()
    expect(disconnectSpy).toHaveBeenCalled()
  })

  it('self-corrects a transitional first-pass measurement via double rAF', async () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    // First synchronous measurement reports "doesn't fit" (transitional layout);
    // by the time the rAF-deferred re-measure runs, geometry has "settled" and
    // fits. `heightAutoCount` increments every time `style.height` is reset to
    // 'auto' — once at the top of each `measureAuto` call, plus once more when
    // a failed single-page search restores the shadow after a pagination
    // measurement. So during the first `measureAuto` call the single-page
    // search itself always sees a low (pre-increment) count and reports
    // "doesn't fit" (triggering the pagination fallback), and by the time the
    // rAF-deferred second call's single-page search runs, the count has
    // already crossed the threshold, so every check reports "fits" and it
    // resolves at cols=1.
    let heightAutoCount = 0
    let col = 1
    const shadow = {
      style: {
        columnWidth: '', columnGap: '', columnFill: '', width: '',
        setProperty: vi.fn(),
        get columnCount() { return col },
        set columnCount(v) { col = v },
        get height() { return this._h },
        set height(v) { this._h = v; if (v === 'auto') heightAutoCount += 1 },
      },
      getBoundingClientRect: () => {
        const fits = heightAutoCount > 1
        if (typeof shadow.style.columnCount === 'number') {
          return { height: fits ? 0 : 9999, width: 0 }
        }
        const colWidth = parseFloat(shadow.style.columnWidth) || 0
        return { height: fits ? 0 : 9999, width: 5 * (colWidth + 32) }
      },
    }

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )
    result.current.shadowRef.current = shadow

    act(() => rerender({ enabled: true }))
    expect(result.current.fitFontSize).toBe(20)
    expect(result.current.paginated).toBe(true)
    // The synchronous first pass is reported as not yet settled — consumers
    // that care about the double-rAF correction window (e.g. MainContent's
    // page-navigation logic) rely on this to distinguish "still settling"
    // from a genuine later update.
    expect(result.current.settled).toBe(false)

    await flushRaf()

    expect(result.current.paginated).toBe(false)
    expect(result.current.fitFontSize).toBeGreaterThan(20)
    expect(result.current.fitColumns).toBe(1)
    // Once the rAF-deferred correction pass has run, the result is settled.
    expect(result.current.settled).toBe(true)
  })

  it('measuredSongId echoes the songId the current state was measured for, and updates when songId changes', async () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled, songId }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, songId }),
      { initialProps: { enabled: false, songId: 'song-a' } }
    )
    result.current.shadowRef.current = makeShadowEl({ fits: true })

    act(() => rerender({ enabled: true, songId: 'song-a' }))
    // Even the unsettled synchronous first pass tags its result with the
    // songId it was actually measured for.
    expect(result.current.measuredSongId).toBe('song-a')
    expect(result.current.settled).toBe(false)

    await flushRaf()
    expect(result.current.measuredSongId).toBe('song-a')
    expect(result.current.settled).toBe(true)

    // Switching songId re-triggers the layout effect's re-measure; the
    // unsettled first pass for the new song already reports the new songId
    // (never the previous song's), and the settled pass keeps reporting it.
    act(() => rerender({ enabled: true, songId: 'song-b' }))
    expect(result.current.measuredSongId).toBe('song-b')

    await flushRaf()
    expect(result.current.measuredSongId).toBe('song-b')
    expect(result.current.settled).toBe(true)
  })

  describe('manual font-size override', () => {
    function setup({ fitsBelow = 20 } = {}) {
      const containerRef = makeContainerRef()
      const bodyRef = makeBodyRef()
      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
        { initialProps: { enabled: false } }
      )
      result.current.shadowRef.current = makeFontAwareShadowEl({ fitsBelow })
      act(() => rerender({ enabled: true }))
      return { result, rerender }
    }

    it('increaseFontSize bumps the font and re-derives columns for it', async () => {
      const { result } = setup({ fitsBelow: 30 }) // everything fits at 1 column initially
      await flushRaf()
      const before = result.current.fitFontSize
      act(() => result.current.increaseFontSize())
      expect(result.current.fitFontSize).toBe(Math.min(before + 2, 28))
      expect(result.current.fitColumns).toBe(1)
    })

    it('increaseFontSize reports settled:true immediately (never part of the initial settling window)', async () => {
      const { result } = setup({ fitsBelow: 30 })
      await flushRaf()
      expect(result.current.settled).toBe(true)
      act(() => result.current.increaseFontSize())
      expect(result.current.settled).toBe(true)
    })

    it('decreaseFontSize lowers the font and re-derives columns for it', async () => {
      const { result } = setup({ fitsBelow: 30 })
      await flushRaf()
      const before = result.current.fitFontSize
      act(() => result.current.decreaseFontSize())
      expect(result.current.fitFontSize).toBe(before - 2)
    })

    it('decreaseFontSize reports settled:true immediately (never part of the initial settling window)', async () => {
      const { result } = setup({ fitsBelow: 30 })
      await flushRaf()
      expect(result.current.settled).toBe(true)
      act(() => result.current.decreaseFontSize())
      expect(result.current.settled).toBe(true)
    })

    it('canIncrease is false once the font is at MAX_FONT', async () => {
      const { result } = setup({ fitsBelow: 30 })
      await flushRaf()
      // Keep increasing until we hit the ceiling
      for (let i = 0; i < 20 && result.current.canIncrease; i++) {
        act(() => result.current.increaseFontSize())
      }
      expect(result.current.fitFontSize).toBe(28)
      expect(result.current.canIncrease).toBe(false)
    })

    it('canDecrease is false once the font is at MIN_FONT', async () => {
      const { result } = setup({ fitsBelow: 30 })
      await flushRaf()
      for (let i = 0; i < 20 && result.current.canDecrease; i++) {
        act(() => result.current.decreaseFontSize())
      }
      expect(result.current.fitFontSize).toBe(20)
      expect(result.current.canDecrease).toBe(false)
    })

    it('increaseFontSize does not throw and leaves state unchanged when shadowRef.current is transiently null during a pagination fallback', async () => {
      // Only fonts <= 20 fit at any column count, so the initial auto-fit lands
      // exactly at MIN_FONT/1-column (not yet paginated) with canIncrease still
      // true. If the shadow ref then goes transiently null (e.g. the shadow DOM
      // node unmounts/remounts) right as the user taps "+", `resultForFont`'s
      // single-page search reports null (shadow missing, not "found a fit"),
      // falls through to `measurePagination`, which also reports null for the
      // same reason — this must not crash on a null dereference, and the state
      // should be left unchanged (matching the pre-existing "nothing fits"
      // guard behavior).
      const { result } = setup({ fitsBelow: 20 })
      await flushRaf()
      const before = { ...result.current }
      expect(before.canIncrease).toBe(true)

      result.current.shadowRef.current = null

      expect(() => act(() => result.current.increaseFontSize())).not.toThrow()
      expect(result.current.fitFontSize).toBe(before.fitFontSize)
      expect(result.current.fitColumns).toBe(before.fitColumns)
      expect(result.current.paginated).toBe(before.paginated)
      expect(result.current.totalPages).toBe(before.totalPages)
    })

    it('decreaseFontSize does not throw and leaves state unchanged when shadowRef.current is transiently null during a pagination fallback', async () => {
      // Everything fits, so the auto-fit search lands at MAX_FONT (28) with
      // canDecrease already true.
      const { result } = setup({ fitsBelow: 30 })
      await flushRaf()
      const before = { ...result.current }
      expect(before.canDecrease).toBe(true)

      result.current.shadowRef.current = null

      expect(() => act(() => result.current.decreaseFontSize())).not.toThrow()
      expect(result.current.fitFontSize).toBe(before.fitFontSize)
      expect(result.current.fitColumns).toBe(before.fitColumns)
      expect(result.current.paginated).toBe(before.paginated)
      expect(result.current.totalPages).toBe(before.totalPages)
    })

    it('resize while in manual mode re-derives columns for the pinned font instead of re-running full auto search', async () => {
      const containerRef = makeContainerRef()
      const bodyRef = makeBodyRef()
      let resizeCallback = null
      vi.stubGlobal('ResizeObserver', vi.fn((cb) => {
        resizeCallback = cb
        return { observe: vi.fn(), disconnect: vi.fn() }
      }))

      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
        { initialProps: { enabled: false } }
      )
      result.current.shadowRef.current = makeFontAwareShadowEl({ fitsBelow: 30 })
      act(() => rerender({ enabled: true }))
      await flushRaf()

      act(() => result.current.increaseFontSize())
      const pinnedFont = result.current.fitFontSize

      act(() => resizeCallback())
      // Advance past the debounce delay (real timers are used in this suite)
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })

      expect(result.current.fitFontSize).toBe(pinnedFont)
      // A resize-triggered manual-mode update is never part of the initial
      // settling window, so it reports settled:true immediately.
      expect(result.current.settled).toBe(true)
    })
  })
})
