import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PerformanceModal } from '../PerformanceModal'

// Minimal song fixture matching the activeSong shape
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
        { type: 'lyric', content: 'That saved a wretch like me', chords: [] },
      ],
    },
    {
      label: 'Chorus',
      lines: [
        { type: 'lyric', content: 'My chains are gone', chords: [] },
      ],
    },
  ],
  rawText: '',
}

describe('PerformanceModal', () => {
  let onClose

  beforeEach(() => {
    onClose = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the song title', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    expect(screen.getByText('Amazing Grace')).toBeInTheDocument()
  })

  it('renders the song artist', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    expect(screen.getByText('John Newton')).toBeInTheDocument()
  })

  it('renders an Exit button', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    expect(screen.getByRole('button', { name: /exit/i })).toBeInTheDocument()
  })

  it('Exit button has type="button"', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    const btn = screen.getByRole('button', { name: /exit/i })
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('calls onClose when Exit button is clicked', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /exit/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders song section labels', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    expect(screen.getByText('Verse 1')).toBeInTheDocument()
    expect(screen.getByText('Chorus')).toBeInTheDocument()
  })

  it('renders lyric content', () => {
    render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    expect(screen.getByText('Amazing grace how sweet the sound')).toBeInTheDocument()
  })

  it('does not render artist span when artist is absent', () => {
    const songNoArtist = {
      ...mockSong,
      meta: { ...mockSong.meta, artist: null },
    }
    render(<PerformanceModal song={songNoArtist} sections={mockSong.sections} onClose={onClose} />)
    // Title should still be there
    expect(screen.getByText('Amazing Grace')).toBeInTheDocument()
    // No artist text
    expect(screen.queryByText('John Newton')).not.toBeInTheDocument()
  })

  it('cleans up keydown listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(<PerformanceModal song={mockSong} sections={mockSong.sections} onClose={onClose} />)
    unmount()

    // The handler registered with addEventListener should also be unregistered
    const addedHandlers = addSpy.mock.calls
      .filter(([event]) => event === 'keydown')
      .map(([, fn]) => fn)
    const removedHandlers = removeSpy.mock.calls
      .filter(([event]) => event === 'keydown')
      .map(([, fn]) => fn)

    // Every keydown listener that was added must have been removed
    for (const handler of addedHandlers) {
      expect(removedHandlers).toContain(handler)
    }
  })
})
