import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PerformanceModal } from '../PerformanceModal'
import { useWakeLock } from '../../../hooks/useWakeLock'

// Wiring test: Performance mode is the on-stage view — the screen must not
// sleep while it is open, so the modal holds a wake lock for its lifetime.

vi.mock('../../../hooks/useWakeLock', () => ({
  useWakeLock: vi.fn(),
}))

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    index: [],
    selectSong: vi.fn(),
  }),
}))

const mockSong = {
  id: 'test-song-1',
  meta: {
    title: 'Amazing Grace',
    artist: 'John Newton',
    key: 'G',
    keyIndex: 7,
    usesFlats: false,
    capo: 0,
    tempo: null,
    timeSignature: null,
    copyright: null,
  },
  sections: [
    {
      label: 'Verse 1',
      lines: [
        { type: 'lyric', content: 'Amazing grace how sweet the sound', chords: [] },
      ],
    },
  ],
}

describe('PerformanceModal wake lock wiring', () => {
  it('holds a screen wake lock while open', () => {
    render(
      <PerformanceModal
        song={mockSong}
        sections={mockSong.sections}
        onClose={vi.fn()}
      />
    )
    expect(useWakeLock).toHaveBeenCalledWith(true)
  })
})
