import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraggablePill } from '../useDraggablePill'

const KEY = 'test_draggable_pill_pos'

function mockPillEl({ left = 100, top = 100, width = 200, height = 300 } = {}) {
  return {
    getBoundingClientRect: () => ({ left, top }),
    offsetWidth: width,
    offsetHeight: height,
  }
}

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height })
}

beforeEach(() => {
  localStorage.clear()
  setViewport(1024, 768)
})

describe('useDraggablePill', () => {
  it('returns null position when nothing stored', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toBeNull()
  })

  it('reads a valid stored position on mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ x: 50, y: 60 }))
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toEqual({ x: 50, y: 60 })
  })

  it('ignores malformed stored JSON and falls back to null', () => {
    localStorage.setItem(KEY, 'not json')
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toBeNull()
  })

  it('ignores a stored value missing x/y and falls back to null', () => {
    localStorage.setItem(KEY, JSON.stringify({ foo: 'bar' }))
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toBeNull()
  })

  it('dragging updates position in both axes', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 230, clientY: 250 }))
    })

    expect(result.current.position).toEqual({ x: 130, y: 150 })
  })

  it('clamps position to the bottom-right viewport margin', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 300 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 5000, clientY: 5000 }))
    })

    // maxX = 1024 - 200 - 8 = 816, maxY = 768 - 300 - 8 = 460
    expect(result.current.position).toEqual({ x: 816, y: 460 })
  })

  it('clamps position to the top-left viewport margin', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: -5000, clientY: -5000 }))
    })

    expect(result.current.position).toEqual({ x: 8, y: 8 })
  })

  it('persists position to localStorage only on pointerup, not on every move', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 230, clientY: 250 }))
    })
    expect(localStorage.getItem(KEY)).toBeNull()

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'))
    })

    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ x: 130, y: 150 })
  })

  it('removes window listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('defaults to vertical orientation before any drag', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.orientation).toBe('vertical')
  })

  it('flips to horizontal orientation when dragged near the top edge', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 110 }))
    })

    expect(result.current.position).toEqual({ x: 400, y: 10 })
    expect(result.current.orientation).toBe('horizontal')
  })

  it('stays vertical when dragged near the left edge', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 110, clientY: 500 }))
    })

    expect(result.current.position).toEqual({ x: 10, y: 400 })
    expect(result.current.orientation).toBe('vertical')
  })

  it('applies hysteresis so a marginal geometry change does not flip orientation, but a clear one does', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })

    // Move 1: solidly near the top edge -> flips to horizontal.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 110 }))
    })
    expect(result.current.orientation).toBe('horizontal')

    // Move 2: raw geometry now marginally favors vertical (by 10px, under the
    // 24px margin) -> stays horizontal.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 360 }))
    })
    expect(result.current.position).toEqual({ x: 200, y: 260 })
    expect(result.current.orientation).toBe('horizontal')

    // Move 3: clearly vertical-favoring (by 84px, over the margin) -> flips.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 434 }))
    })
    expect(result.current.position).toEqual({ x: 200, y: 334 })
    expect(result.current.orientation).toBe('vertical')
  })
})
