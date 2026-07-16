import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNativeFullscreen } from '../useNativeFullscreen'

describe('useNativeFullscreen', () => {
  let requestFullscreenMock
  let exitFullscreenMock

  beforeEach(() => {
    requestFullscreenMock = vi.fn(() => Promise.resolve())
    exitFullscreenMock = vi.fn(() => Promise.resolve())
    document.documentElement.requestFullscreen = requestFullscreenMock
    document.exitFullscreen = exitFullscreenMock
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
  })

  afterEach(() => {
    delete document.documentElement.requestFullscreen
    delete document.exitFullscreen
    vi.restoreAllMocks()
  })

  it('reports supported when requestFullscreen exists and fullscreenEnabled is true', () => {
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    expect(result.current.isSupported).toBe(true)
  })

  it('reports unsupported when requestFullscreen is missing from the document element', () => {
    delete document.documentElement.requestFullscreen
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    expect(result.current.isSupported).toBe(false)
  })

  it('calls document.documentElement.requestFullscreen when requestFullscreen() is invoked', () => {
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    act(() => { result.current.requestFullscreen() })
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1)
  })

  it('does not call requestFullscreen when unsupported, and does not throw', () => {
    delete document.documentElement.requestFullscreen
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    expect(() => act(() => { result.current.requestFullscreen() })).not.toThrow()
    expect(requestFullscreenMock).not.toHaveBeenCalled()
  })

  it('calls document.exitFullscreen when a fullscreenElement is currently set', () => {
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true })
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    act(() => { result.current.exitFullscreen() })
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1)
  })

  it('does not call document.exitFullscreen when nothing is fullscreen', () => {
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    act(() => { result.current.exitFullscreen() })
    expect(exitFullscreenMock).not.toHaveBeenCalled()
  })

  it('calls onExit when fullscreenchange fires with no fullscreenElement while active', () => {
    const onExit = vi.fn()
    renderHook(() => useNativeFullscreen({ active: true, onExit }))
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('does not call onExit from fullscreenchange when inactive', () => {
    const onExit = vi.fn()
    renderHook(() => useNativeFullscreen({ active: false, onExit }))
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    expect(onExit).not.toHaveBeenCalled()
  })
})
