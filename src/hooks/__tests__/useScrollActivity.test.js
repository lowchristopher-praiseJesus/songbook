import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollActivity } from '../useScrollActivity'

describe('useScrollActivity', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  // Like useRef in a component, the ref object must be identity-stable
  // across renders — an inline literal would reset the effect (and its
  // pending idle timer) on every state change.
  function makeTree() {
    const parent = document.createElement('div')
    const child = document.createElement('div')
    parent.appendChild(child)
    document.body.appendChild(parent)
    return { ref: { current: parent }, child }
  }

  it('is false before any scrolling', () => {
    const { ref } = makeTree()
    const { result } = renderHook(() => useScrollActivity(ref))
    expect(result.current).toBe(false)
  })

  it('turns true when a descendant element scrolls', () => {
    // Scroll events do not bubble, so the hook must use a capture-phase
    // listener to observe the inner song scroller from the outer <main>.
    const { ref, child } = makeTree()
    const { result } = renderHook(() => useScrollActivity(ref))
    act(() => { child.dispatchEvent(new Event('scroll')) })
    expect(result.current).toBe(true)
  })

  it('returns to false after the idle delay', () => {
    const { ref, child } = makeTree()
    const { result } = renderHook(() => useScrollActivity(ref, 800))
    act(() => { child.dispatchEvent(new Event('scroll')) })
    act(() => { vi.advanceTimersByTime(900) })
    expect(result.current).toBe(false)
  })

  it('stays true while scrolling continues', () => {
    const { ref, child } = makeTree()
    const { result } = renderHook(() => useScrollActivity(ref, 800))
    act(() => { child.dispatchEvent(new Event('scroll')) })
    act(() => { vi.advanceTimersByTime(500) })
    act(() => { child.dispatchEvent(new Event('scroll')) })
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBe(true)
  })

  it('handles a null ref without crashing', () => {
    expect(() => renderHook(() => useScrollActivity({ current: null }))).not.toThrow()
  })
})
