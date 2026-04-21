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

  it('falls back to 4 columns at min font (10) when nothing fits', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makeShadowEl({ fits: false })
    act(() => rerender({ enabled: true }))

    expect(result.current.fitFontSize).toBe(10)
    expect(result.current.fitColumns).toBe(4)
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
})
