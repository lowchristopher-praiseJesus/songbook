import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongHeader } from '../SongHeader'
import { useRecording } from '../../../hooks/useRecording'

vi.mock('../../../hooks/useRecording', () => ({
  useRecording: vi.fn(() => ({
    status: 'idle',
    elapsedMs: 0,
    pendingName: '',
    error: null,
    recordingCount: 0,
    hasRecordings: false,
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    saveRecording: vi.fn(),
    cancelNaming: vi.fn(),
    dismissError: vi.fn(),
    refreshRecordingCount: vi.fn(),
    handleRecordingsChange: vi.fn(),
  })),
}))

vi.mock('../../../lib/recorderFeatureDetect', () => ({
  checkRecorderSupport: vi.fn(() => ({ supported: true })),
}))

vi.mock('../../Recorder/RecordingsPanel', () => ({
  RecordingsPanel: vi.fn(() => null),
}))

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

const recorderProps = { ...baseProps, songId: 'song-abc' }

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
    useRecording.mockReturnValueOnce({
      status: 'idle',
      elapsedMs: 0,
      pendingName: '',
      error: null,
      recordingCount: 2,
      hasRecordings: true,
      startRecording: vi.fn(),
      pauseRecording: vi.fn(),
      resumeRecording: vi.fn(),
      stopRecording: vi.fn(),
      saveRecording: vi.fn(),
      cancelNaming: vi.fn(),
      dismissError: vi.fn(),
      refreshRecordingCount: vi.fn(),
      handleRecordingsChange: vi.fn(),
    })

    render(<SongHeader {...recorderProps} />)

    expect(screen.getByRole('button', { name: /recordings available/i })).toBeInTheDocument()
    expect(screen.getByTitle(/this song has recordings/i).nextElementSibling).toHaveClass('bg-red-500')
  })

  it('shows recording errors and lets the user dismiss them', () => {
    const dismissError = vi.fn()
    useRecording.mockReturnValueOnce({
      status: 'error',
      elapsedMs: 0,
      pendingName: '',
      error: 'Microphone access was blocked. Enable microphone permission for this site in your browser settings, then try recording again.',
      recordingCount: 0,
      hasRecordings: false,
      startRecording: vi.fn(),
      pauseRecording: vi.fn(),
      resumeRecording: vi.fn(),
      stopRecording: vi.fn(),
      saveRecording: vi.fn(),
      cancelNaming: vi.fn(),
      dismissError,
      refreshRecordingCount: vi.fn(),
      handleRecordingsChange: vi.fn(),
    })

    render(<SongHeader {...recorderProps} />)

    expect(screen.getByRole('dialog', { name: /microphone access needed/i })).toBeInTheDocument()
    expect(screen.getByText(/Microphone access was blocked/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(dismissError).toHaveBeenCalledOnce()
  })
})
