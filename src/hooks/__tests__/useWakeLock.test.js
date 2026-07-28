import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWakeLock } from '../useWakeLock'

describe('useWakeLock', () => {
  let sentinel
  let request

  beforeEach(() => {
    sentinel = { release: vi.fn(() => Promise.resolve()) }
    request = vi.fn(() => Promise.resolve(sentinel))
    vi.stubGlobal('navigator', { wakeLock: { request } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('requests a screen wake lock when active', async () => {
    renderHook(() => useWakeLock(true))
    await act(async () => {})
    expect(request).toHaveBeenCalledWith('screen')
  })

  it('does not request a wake lock while inactive', async () => {
    renderHook(() => useWakeLock(false))
    await act(async () => {})
    expect(request).not.toHaveBeenCalled()
  })

  it('releases the sentinel when active goes false', async () => {
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await act(async () => {})
    rerender({ active: false })
    await act(async () => {})
    expect(sentinel.release).toHaveBeenCalled()
  })

  it('releases the sentinel on unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock(true))
    await act(async () => {})
    unmount()
    expect(sentinel.release).toHaveBeenCalled()
  })

  it('re-requests the lock when the page becomes visible again', async () => {
    renderHook(() => useWakeLock(true))
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(1)
    // jsdom's document.visibilityState is 'visible' by default, so this
    // simulates the tab coming back to the foreground.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not listen for visibility changes while inactive', async () => {
    renderHook(() => useWakeLock(false))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('is a no-op when the Wake Lock API is unsupported', async () => {
    vi.stubGlobal('navigator', {})
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
  })

  it('survives a rejected request (e.g. low battery)', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'))
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
    await act(async () => {})
  })
})
