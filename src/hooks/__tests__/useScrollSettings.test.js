import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollSettings } from '../useScrollSettings'

beforeEach(() => localStorage.clear())

describe('useScrollSettings', () => {
  it('returns default 90 when no stored value for song', () => {
    const { result } = renderHook(() => useScrollSettings('song-1'))
    expect(result.current.targetDuration).toBe(90)
  })

  it('returns default 90 when songId is null', () => {
    const { result } = renderHook(() => useScrollSettings(null))
    expect(result.current.targetDuration).toBe(90)
  })

  it('reads stored value for the given song', () => {
    localStorage.setItem('songsheet_scroll_durations', JSON.stringify({ 'song-1': 120 }))
    const { result } = renderHook(() => useScrollSettings('song-1'))
    expect(result.current.targetDuration).toBe(120)
  })

  it('setTargetDuration updates state and persists for the given song', () => {
    const { result } = renderHook(() => useScrollSettings('song-1'))
    act(() => result.current.setTargetDuration(120))
    expect(result.current.targetDuration).toBe(120)
    const stored = JSON.parse(localStorage.getItem('songsheet_scroll_durations'))
    expect(stored['song-1']).toBe(120)
  })

  it('different songs have independent durations', () => {
    localStorage.setItem('songsheet_scroll_durations', JSON.stringify({ 'song-1': 120, 'song-2': 60 }))
    const { result: r1 } = renderHook(() => useScrollSettings('song-1'))
    const { result: r2 } = renderHook(() => useScrollSettings('song-2'))
    expect(r1.current.targetDuration).toBe(120)
    expect(r2.current.targetDuration).toBe(60)
  })

  it('setting duration for one song does not affect another', () => {
    localStorage.setItem('songsheet_scroll_durations', JSON.stringify({ 'song-2': 60 }))
    const { result } = renderHook(() => useScrollSettings('song-1'))
    act(() => result.current.setTargetDuration(200))
    const stored = JSON.parse(localStorage.getItem('songsheet_scroll_durations'))
    expect(stored['song-1']).toBe(200)
    expect(stored['song-2']).toBe(60)
  })

  it('clamps value to minimum 30', () => {
    const { result } = renderHook(() => useScrollSettings('song-1'))
    act(() => result.current.setTargetDuration(10))
    expect(result.current.targetDuration).toBe(30)
  })

  it('clamps value to maximum 600', () => {
    const { result } = renderHook(() => useScrollSettings('song-1'))
    act(() => result.current.setTargetDuration(700))
    expect(result.current.targetDuration).toBe(600)
  })
})
