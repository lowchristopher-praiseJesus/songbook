import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongView } from '../SongView'

// Stub SongList to avoid its deep hook dependencies
vi.mock('../SongList', () => ({
  SongList: vi.fn(() => <div data-testid="song-list" />),
}))

const mockObserve = vi.fn()
const mockDisconnect = vi.fn()

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', vi.fn(() => ({
    observe: mockObserve,
    unobserve: vi.fn(),
    disconnect: mockDisconnect,
  })))
  mockObserve.mockClear()
  mockDisconnect.mockClear()
})

const song = {
  id: 'song-1',
  meta: { title: 'Test Song', keyIndex: 0 },
  sections: [
    { label: 'Intro', lines: [] },
    { label: 'Verse 1', lines: [] },
    { label: 'Chorus', lines: [] },
  ],
}

const baseProps = {
  song,
  onPerformanceMode: vi.fn(),
  lyricsOnly: false,
  fontSize: 16,
  onFontSizeChange: vi.fn(),
  chordsOpen: true,
  onChordsToggle: vi.fn(),
  onEdit: vi.fn(),
  isFit: false,
  containerRef: { current: null },
}

describe('SongView', () => {
  it('renders the song list', () => {
    render(<SongView {...baseProps} />)
    expect(screen.getByTestId('song-list')).toBeInTheDocument()
  })

  it('renders the sections tab button when sidebar is closed', () => {
    render(<SongView {...baseProps} />)
    expect(screen.getByRole('button', { name: /show sections panel/i })).toBeInTheDocument()
  })

  it('opens the sidebar when the tab is clicked', () => {
    render(<SongView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /show sections panel/i }))
    expect(screen.getByRole('button', { name: 'Intro' })).toBeInTheDocument()
  })

  it('closes the sidebar when the hide button is clicked', () => {
    render(<SongView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /show sections panel/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide sections panel/i }))
    expect(screen.queryByRole('button', { name: 'Intro' })).not.toBeInTheDocument()
  })

  it('registers an IntersectionObserver on mount', () => {
    render(<SongView {...baseProps} />)
    expect(IntersectionObserver).toHaveBeenCalledTimes(1)
  })
})
