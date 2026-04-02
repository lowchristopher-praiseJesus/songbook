import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoScroll } from '../useAutoScroll'

describe('useAutoScroll', () => {
  let rafCallbacks

  beforeEach(() => {
    rafCallbacks = []
    vi.stubGlobal('requestAnimationFrame', vi.fn(cb => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => vi.unstubAllGlobals())

  function makeContainerRef(scrollHeight = 1000, clientHeight = 400, scrollTop = 0) {
    return { current: { scrollHeight, clientHeight, scrollTop } }
  }

  it('isScrolling is false initially', () => {
    const { result } = renderHook(() => useAutoScroll(makeContainerRef(), 90))
    expect(result.current.isScrolling).toBe(false)
  })

  it('start() with no scrollable content is a no-op', () => {
    const containerRef = makeContainerRef(400, 400) // scrollHeight === clientHeight
    const { result } = renderHook(() => useAutoScroll(containerRef, 90))
    act(() => result.current.start())
    expect(result.current.isScrolling).toBe(false)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('start() sets isScrolling true and schedules a frame', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useAutoScroll(containerRef, 90))
    act(() => result.current.start())
    expect(result.current.isScrolling).toBe(true)
    expect(requestAnimationFrame).toHaveBeenCalledOnce()
  })

  it('stop() sets isScrolling false and cancels the frame', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useAutoScroll(containerRef, 90))
    act(() => result.current.start())
    act(() => result.current.stop())
    expect(result.current.isScrolling).toBe(false)
    expect(cancelAnimationFrame).toHaveBeenCalledOnce()
  })

  it('tick advances scrollTop by pxPerFrame', () => {
    // scrollable = 600, targetDuration = 10s → pxPerFrame = 600 / (10 * 60) = 1
    const containerRef = makeContainerRef(1000, 400)
    const { result } = renderHook(() => useAutoScroll(containerRef, 10))
    act(() => result.current.start())
    act(() => rafCallbacks[0]())
    expect(containerRef.current.scrollTop).toBeCloseTo(1)
  })

  it('start() while already scrolling is a no-op', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() => useAutoScroll(containerRef, 90))
    act(() => result.current.start())
    act(() => result.current.start()) // second call should be ignored
    expect(requestAnimationFrame).toHaveBeenCalledOnce() // only one rAF scheduled
  })

  it('stops automatically when bottom is reached', () => {
    // scrollable = 600; start with scrollTop already at 600 (bottom)
    const containerRef = makeContainerRef(1000, 400, 600)
    const { result } = renderHook(() => useAutoScroll(containerRef, 90))
    act(() => result.current.start())
    act(() => rafCallbacks[0]())
    expect(result.current.isScrolling).toBe(false)
  })
})
