import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SongList } from '../SongList'

// Stub out hooks/modules that need real infrastructure
vi.mock('../../../hooks/useTranspose', () => ({
  useTranspose: vi.fn(() => ({
    delta: 0,
    capo: 0,
    capoUp: vi.fn(),
    capoDown: vi.fn(),
    transposeTo: vi.fn(),
    transposedSections: [
      { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello', chords: [] }] },
    ],
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
  meta: { title: 'Test', keyIndex: 0, key: 'Eb', tempo: 120 },
  sections: [],
}

const containerRef = { current: document.createElement('div') }

vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})))

describe('SongList fitMode', () => {
  it('shows the song title, key, and tempo at the top when isFit is true', () => {
    const { getByRole, getByText } = render(
      <SongList
        song={song}
        onPerformanceMode={vi.fn()}
        lyricsOnly={false}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        chordsOpen={true}
        onChordsToggle={vi.fn()}
        onEdit={vi.fn()}
        isFit={true}
        containerRef={containerRef}
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={2}
        shadowRef={{ current: null }}
      />
    )
    expect(getByRole('heading', { name: 'Test' })).not.toBeNull()
    expect(getByText('Key: Eb')).not.toBeNull()
    expect(getByText('BPM: 120')).not.toBeNull()
  })

  it('renders the title exactly once when isFit is true (no duplicate from the sticky header)', () => {
    const { getAllByRole } = render(
      <SongList
        song={song}
        onPerformanceMode={vi.fn()}
        lyricsOnly={false}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        chordsOpen={true}
        onChordsToggle={vi.fn()}
        onEdit={vi.fn()}
        isFit={true}
        containerRef={containerRef}
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={2}
        shadowRef={{ current: null }}
      />
    )
    expect(getAllByRole('heading', { name: 'Test' })).toHaveLength(1)
  })

  it('renders a hidden shadow SongBody when isFit is true', () => {
    const { container } = render(
      <SongList
        song={song}
        onPerformanceMode={vi.fn()}
        lyricsOnly={false}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        chordsOpen={true}
        onChordsToggle={vi.fn()}
        onEdit={vi.fn()}
        isFit={true}
        containerRef={containerRef}
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={2}
        shadowRef={{ current: null }}
      />
    )
    // Shadow div has position absolute and top -9999px
    const shadow = container.querySelector('[style*="-9999"]')
    expect(shadow).not.toBeNull()
  })

  it('does not render shadow SongBody when isFit is false', () => {
    const { container } = render(
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
        containerRef={containerRef}
      />
    )
    const shadow = container.querySelector('[style*="-9999"]')
    expect(shadow).toBeNull()
  })

  it('threads pagination props through to the live SongBody', () => {
    const { container } = render(
      <SongList
        song={song}
        onPerformanceMode={vi.fn()}
        lyricsOnly={false}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        chordsOpen={true}
        onChordsToggle={vi.fn()}
        onEdit={vi.fn()}
        isFit={true}
        containerRef={containerRef}
        bodyRef={{ current: null }}
        fitFontSize={20}
        fitColumns={3}
        paginated={true}
        totalColumns={7}
        currentPage={2}
        pageColWidth={200}
        fitAvailableHeight={600}
        shadowRef={{ current: null }}
      />
    )
    // pageWidth = 3*200 + 2*32 = 664; currentPage 2 -> translateX(-1328px)
    const flow = container.querySelector('[style*="translateX"]')
    expect(flow).not.toBeNull()
    expect(flow.style.transform).toBe('translateX(-1328px)')
  })
})
