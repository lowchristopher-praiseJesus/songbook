import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDisplaySettings } from '../useDisplaySettings'

beforeEach(() => localStorage.clear())

describe('useDisplaySettings — maximizeMinFontSize', () => {
  it('defaults to 18 when nothing is stored', () => {
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.maximizeMinFontSize).toBe(18)
  })

  it('updateMinFontSize persists the new value and updates state', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(22))
    expect(result.current.settings.maximizeMinFontSize).toBe(22)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(22)
  })

  it('updateMinFontSize clamps values above 28 down to 28', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(999))
    expect(result.current.settings.maximizeMinFontSize).toBe(28)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(28)
  })

  it('updateMinFontSize clamps values below 8 up to 8', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(-5))
    expect(result.current.settings.maximizeMinFontSize).toBe(8)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(8)
  })

  it('loads a valid stored value on mount', () => {
    localStorage.setItem('songsheet_display_maximize_min_font_size', JSON.stringify(24))
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.maximizeMinFontSize).toBe(24)
  })

  it('clamps an out-of-range stored value on load', () => {
    localStorage.setItem('songsheet_display_maximize_min_font_size', JSON.stringify(999))
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.maximizeMinFontSize).toBe(28)
  })

  it('resetAll restores maximizeMinFontSize to 18', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(24))
    act(() => result.current.resetAll())
    expect(result.current.settings.maximizeMinFontSize).toBe(18)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(18)
  })
})

describe('useDisplaySettings — section and annotation legibility defaults', () => {
  // Section labels (INTRO/CHORUS/...) are the at-a-glance navigation aid on
  // a music stand, and annotations carry performance notes — both used to
  // default to 12px, too small to read comfortably at arm's length.
  it('defaults section label size to 14px when nothing is stored', () => {
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.sections.size).toBe(14)
  })

  it('defaults annotation size to 14px when nothing is stored', () => {
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.annotations.size).toBe(14)
  })
})
