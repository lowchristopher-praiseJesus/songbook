import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongHeader } from '../SongHeader'
import { getFirecrawlKey } from '../../../lib/storage'

vi.mock('../../../lib/recorderFeatureDetect', () => ({
  checkRecorderSupport: vi.fn(() => ({ supported: true })),
}))
vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: vi.fn(() => null) }))

const mockOpenYoutubePlayer = vi.fn()
vi.mock('../../../store/youtubePlayerStore', () => ({
  useYoutubePlayerStore: selector => selector({ open: mockOpenYoutubePlayer }),
}))

const baseRecording = {
  status: 'idle',
  elapsedMs: 0,
  pendingName: '',
  error: null,
  recordingCount: 0,
  hasRecordings: false,
  channels: null,
  startRecording: vi.fn(),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  stopRecording: vi.fn(),
  saveRecording: vi.fn(),
  cancelNaming: vi.fn(),
  dismissError: vi.fn(),
  refreshRecordingCount: vi.fn(),
  handleRecordingsChange: vi.fn(),
}

const baseProps = {
  meta: { title: 'Amazing Grace', artist: 'John Newton', keyIndex: 7, isMinor: false, capo: 0 },
  transpose: {
    delta: 0,
    capo: 0,
    transposeTo: vi.fn(),
    capoDown: vi.fn(),
    capoUp: vi.fn(),
  },
  lyricsOnly: false,
  onPerformanceMode: vi.fn(),
  onExportPdf: vi.fn(),
  onEdit: vi.fn(),
  onAnnotationsToggle: vi.fn(),
  annotationsVisible: true,
}

describe('SongHeader YouTube link', () => {
  it('links to a YouTube search for the song title and artist', () => {
    render(<SongHeader {...baseProps} />)
    const link = screen.getByRole('link', { name: /youtube/i })
    expect(link).toHaveAttribute(
      'href',
      'https://www.youtube.com/results?search_query=Amazing%20Grace%20John%20Newton'
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('omits the artist from the search query when absent', () => {
    render(<SongHeader {...baseProps} meta={{ ...baseProps.meta, artist: undefined }} />)
    const link = screen.getByRole('link', { name: /youtube/i })
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/results?search_query=Amazing%20Grace')
  })
})

describe('SongHeader annotation', () => {
  it('renders song-level annotation when annotationsVisible is true', () => {
    render(<SongHeader {...baseProps} meta={{ ...baseProps.meta, annotation: 'sing joyfully' }} />)
    expect(screen.getByText('sing joyfully')).toBeInTheDocument()
  })

  it('hides song-level annotation when annotationsVisible is false', () => {
    render(<SongHeader {...baseProps} meta={{ ...baseProps.meta, annotation: 'sing joyfully' }} annotationsVisible={false} />)
    expect(screen.queryByText('sing joyfully')).not.toBeInTheDocument()
  })

  it('does not render annotation element when meta.annotation is absent', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.queryByRole('paragraph', { name: /annotation/i })).not.toBeInTheDocument()
  })

  it('renders the annotations toggle button', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Hide annotations' })).toBeInTheDocument()
  })

  it('toggle button shows correct aria-label when annotations hidden', () => {
    render(<SongHeader {...baseProps} annotationsVisible={false} />)
    expect(screen.getByRole('button', { name: 'Show annotations' })).toBeInTheDocument()
  })

  it('clicking toggle button calls onAnnotationsToggle', () => {
    const onAnnotationsToggle = vi.fn()
    render(<SongHeader {...baseProps} onAnnotationsToggle={onAnnotationsToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide annotations' }))
    expect(onAnnotationsToggle).toHaveBeenCalledOnce()
  })
})

const recorderProps = {
  ...baseProps,
  songId: 'song-abc',
  recording: baseRecording,
  onPanelOpen: vi.fn(),
}

beforeEach(() => {
  getFirecrawlKey.mockReturnValue(null)
  mockOpenYoutubePlayer.mockClear()
})

describe('SongHeader recorder integration', () => {
  it('renders the record button when songId is provided', () => {
    render(<SongHeader {...recorderProps} />)
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
  })

  it('does not render record button when songId is absent', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.queryByRole('button', { name: /start recording/i })).not.toBeInTheDocument()
  })

  it('renders a Recordings button when songId is provided', () => {
    render(<SongHeader {...recorderProps} />)
    expect(screen.getByRole('button', { name: /recordings/i })).toBeInTheDocument()
  })

  it('shows a red dot on the Recordings button when the song has recordings', () => {
    render(<SongHeader {...recorderProps} recording={{ ...baseRecording, hasRecordings: true, recordingCount: 2 }} />)
    expect(screen.getByRole('button', { name: /recordings available/i })).toBeInTheDocument()
    expect(screen.getByTitle(/this song has recordings/i).nextElementSibling).toHaveClass('bg-red-500')
  })

  it('hides the Rec button when recording is active (controls are in sticky bar)', () => {
    render(<SongHeader {...recorderProps} recording={{ ...baseRecording, status: 'recording' }} />)
    expect(screen.queryByRole('button', { name: /start recording/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pause recording/i })).not.toBeInTheDocument()
  })
})

describe('SongHeader YouTube control — no Firecrawl key', () => {
  it('renders a plain link to YouTube search', () => {
    render(<SongHeader {...baseProps} />)
    const link = screen.getByRole('link', { name: /youtube/i })
    expect(link).toHaveAttribute(
      'href',
      'https://www.youtube.com/results?search_query=Amazing%20Grace%20John%20Newton',
    )
  })

  it('does not render a YouTube modal-trigger button', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.queryByRole('button', { name: /youtube/i })).not.toBeInTheDocument()
  })
})

describe('SongHeader YouTube control — Firecrawl key present', () => {
  beforeEach(() => {
    getFirecrawlKey.mockReturnValue('KEY')
  })

  it('renders a button instead of a link', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.getByRole('button', { name: /youtube/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /youtube/i })).not.toBeInTheDocument()
  })

  // The actual player (search UI + embedded iframe) is owned and rendered by
  // MainContent, not SongHeader — see MainContent.youtube.test.jsx. SongHeader
  // no longer knows about "modal open" or "minimized" state; it only has to
  // ask the global store to open the player for this song. That store lives
  // outside SongHeader specifically so the player survives SongHeader's own
  // subtree being unmounted/covered when entering Maximize or Performance mode.
  it('clicking YouTube asks the global player store to open for this song', () => {
    render(<SongHeader {...baseProps} songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /youtube/i }))
    expect(mockOpenYoutubePlayer).toHaveBeenCalledWith('song-1')
  })
})
