import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongList } from '../SongList'

vi.mock('../../../hooks/useTranspose', () => ({
  useTranspose: vi.fn(() => ({
    delta: 0,
    capo: 0,
    capoUp: vi.fn(),
    capoDown: vi.fn(),
    transposeTo: vi.fn(),
    transposedSections: [],
    usesFlats: false,
  })),
}))

vi.mock('../../../lib/exportPdf', () => ({ exportLyricsPdf: vi.fn() }))

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
  checkRecorderSupport: vi.fn(() => ({ supported: false })),
}))

vi.mock('../../Recorder/RecordingsPanel', () => ({
  RecordingsPanel: vi.fn(() => null),
}))

const song = {
  id: 'song-1',
  meta: { title: 'Test', keyIndex: 0 },
  sections: [],
}

function renderSongList(props = {}) {
  return render(
    <SongList
      song={song}
      onPerformanceMode={vi.fn()}
      lyricsOnly={false}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      chordsOpen={true}
      onChordsToggle={vi.fn()}
      onEdit={vi.fn()}
      isFit={false}
      containerRef={{ current: null }}
      {...props}
    />
  )
}

describe('SongList back-to-collection threading', () => {
  it('passes collectionName and onBackToCollection through to SongHeader', () => {
    const onBackToCollection = vi.fn()
    renderSongList({ collectionName: 'Sunday Worship', onBackToCollection })
    const link = screen.getByRole('button', { name: '← Sunday Worship' })
    fireEvent.click(link)
    expect(onBackToCollection).toHaveBeenCalledOnce()
  })

  it('renders no back link when collectionName is not provided', () => {
    renderSongList()
    expect(screen.queryByText(/^←/)).not.toBeInTheDocument()
  })
})
