import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongHeader } from '../SongHeader'

vi.mock('../../../lib/recorderFeatureDetect', () => ({
  checkRecorderSupport: vi.fn(() => ({ supported: true })),
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
