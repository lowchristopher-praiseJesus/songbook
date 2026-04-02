import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollSettings } from '../useScrollSettings'

beforeEach(() => localStorage.clear())

describe('useScrollSettings', () => {
  it('returns default 90 when no stored value', () => {
    const { result } = renderHook(() => useScrollSettings())
    expect(result.current.targetDuration).toBe(90)
  })

  it('reads stored value from localStorage', () => {
    localStorage.setItem('songsheet_scroll_duration', '120')
    const { result } = renderHook(() => useScrollSettings())
    expect(result.current.targetDuration).toBe(120)
  })

  it('setTargetDuration updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useScrollSettings())
    act(() => result.current.setTargetDuration(120))
    expect(result.current.targetDuration).toBe(120)
    expect(JSON.parse(localStorage.getItem('songsheet_scroll_duration'))).toBe(120)
  })

  it('clamps value to minimum 30', () => {
    const { result } = renderHook(() => useScrollSettings())
    act(() => result.current.setTargetDuration(10))
    expect(result.current.targetDuration).toBe(30)
  })

  it('clamps value to maximum 600', () => {
    const { result } = renderHook(() => useScrollSettings())
    act(() => result.current.setTargetDuration(700))
    expect(result.current.targetDuration).toBe(600)
  })
})
