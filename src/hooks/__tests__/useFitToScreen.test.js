import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFitToScreen } from '../useFitToScreen'

function makeContainerRef(clientHeight = 400) {
  return { current: { clientHeight, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) } }
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

  it('falls back to 3 columns at min font (20) when nothing fits', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makeShadowEl({ fits: false })
    act(() => rerender({ enabled: true }))

    expect(result.current.fitFontSize).toBe(20)
    expect(result.current.fitColumns).toBe(3)
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

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    // First synchronous measurement reports "doesn't fit" (transitional layout);
    // by the time the rAF-deferred re-measure runs, geometry has "settled" and fits.
    // `passCount` increments each time the column sweep restarts at cols=1, which
    // happens exactly once per top-level measure invocation (measureAuto or
    // deriveColumnsForFont) — so the first full measureAuto pass (plus its
    // trailing canIncrease probe) accounts for passCount values 1 and 2, and the
    // rAF-deferred re-measure is the first pass to see passCount > 2.
    let passCount = 0
    let col = 1
    result.current.shadowRef.current = {
      style: {
        height: '',
        setProperty: vi.fn(),
        get columnCount() { return col },
        set columnCount(v) {
          col = v
          if (v === 1) passCount += 1
        },
      },
      getBoundingClientRect: () => ({ height: passCount > 2 ? 0 : 9999 }),
    }

    act(() => rerender({ enabled: true }))
    expect(result.current.fitFontSize).toBe(20)
    expect(result.current.fitColumns).toBe(3)

    await flushRaf()

    expect(result.current.fitFontSize).toBeGreaterThan(10)
    expect(result.current.fitColumns).toBe(1)
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

    it('decreaseFontSize lowers the font and re-derives columns for it', async () => {
      const { result } = setup({ fitsBelow: 30 })
      await flushRaf()
      const before = result.current.fitFontSize
      act(() => result.current.decreaseFontSize())
      expect(result.current.fitFontSize).toBe(before - 2)
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

    it('canIncrease is false when no column count fits the next font step', async () => {
      // Only fonts <= 24 fit at any column count (24 is inside the new [20,28] range)
      const { result } = setup({ fitsBelow: 24 })
      await flushRaf()
      expect(result.current.fitFontSize).toBeLessThanOrEqual(24)
      expect(result.current.canIncrease).toBe(false)
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
    })
  })
})
