import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTranspose } from '../useTranspose'
import { getTransposeState, setTransposeState } from '../../lib/storage'

const sections = [
  {
    type: 'verse',
    title: 'Verse',
    lines: [{ lyrics: 'Hello', chords: [{ chord: 'D', position: 0 }] }],
  },
]

describe('useTranspose', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts a newly opened song from saved metadata instead of stale transpose state', () => {
    setTransposeState('song-1', { delta: 5, capo: 3 })

    const { result } = renderHook(() => useTranspose(sections, false, 'song-1', 0))

    expect(result.current.delta).toBe(0)
    expect(result.current.capo).toBe(0)
    expect(getTransposeState('song-1')).toEqual({ delta: 0, capo: 0 })
  })

  it('still persists transpose changes made in the current view', () => {
    const { result } = renderHook(() => useTranspose(sections, false, 'song-1', 0))

    act(() => result.current.transposeTo(5))
    act(() => result.current.capoUp())

    expect(getTransposeState('song-1')).toEqual({ delta: 5, capo: 1 })
  })
})
