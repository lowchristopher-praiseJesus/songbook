import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTranspose } from '../useTranspose'
import { resetTransposeSession } from '../../store/transposeStore'

const sections = [
  { type: 'verse', title: 'Verse', lines: [{ lyrics: 'Hello', chords: [{ chord: 'Am', position: 0 }] }] },
]
const firstChord = r => r.current.transposedSections[0].lines[0].chords[0].chord

// Full Screen and the normal view are separate SongList instances, so each
// switch unmounts one useTranspose and mounts another for the same song.
describe('useTranspose across remounts (Full Screen / Performance)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetTransposeSession()
  })

  it('keeps the key change when the view is remounted for the same song', () => {
    const view = renderHook(() => useTranspose(sections, false, 'song-1', 0))
    act(() => view.result.current.transposeTo(2))
    act(() => view.result.current.capoUp())
    view.unmount()

    const fullScreen = renderHook(() => useTranspose(sections, false, 'song-1', 0))
    expect(fullScreen.result.current.delta).toBe(2)
    expect(fullScreen.result.current.capo).toBe(1)
  })

  it('renders transposed chords in the remounted view', () => {
    const view = renderHook(() => useTranspose(sections, false, 'song-1', 0))
    act(() => view.result.current.transposeTo(2))
    view.unmount()

    const fullScreen = renderHook(() => useTranspose(sections, false, 'song-1', 0))
    expect(firstChord(fullScreen.result)).toBe('Bm')
  })

  it('shares the key between views mounted at the same time', () => {
    const a = renderHook(() => useTranspose(sections, false, 'song-1', 0))
    const b = renderHook(() => useTranspose(sections, false, 'song-1', 0))
    act(() => a.result.current.transposeTo(2))
    expect(b.result.current.delta).toBe(2)
  })

  it('still starts a different song from its saved key', () => {
    const view = renderHook(({ id }) => useTranspose(sections, false, id, 0), { initialProps: { id: 'song-1' } })
    act(() => view.result.current.transposeTo(2))
    view.rerender({ id: 'song-2' })
    expect(view.result.current.delta).toBe(0)
    view.rerender({ id: 'song-1' })
    expect(view.result.current.delta).toBe(0)
  })
})
