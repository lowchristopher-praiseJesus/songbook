import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainContent } from '../MainContent'

const songs = {
  'song-1': { id: 'song-1', meta: { title: 'Song One', keyIndex: 0 }, sections: [] },
  'song-2': { id: 'song-2', meta: { title: 'Song Two', keyIndex: 0 }, sections: [] },
  'song-3': { id: 'song-3', meta: { title: 'Song Three', keyIndex: 0 }, sections: [] },
}
let currentSongId = 'song-2'
const mockSelectSong = vi.fn((id) => { currentSongId = id })

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector =>
    selector({
      get activeSong() { return songs[currentSongId] },
      get activeSongId() { return currentSongId },
      index: [],
      collections: [],
      selectSong: (id) => mockSelectSong(id),
      editingSongId: null,
      setEditingSongId: vi.fn(),
      viewMode: 'all',
    })
  ),
}))

vi.mock('../../../hooks/useDropZone', () => ({
  useDropZone: vi.fn(() => ({ isDragging: false, onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() })),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: vi.fn(() => ({ importFiles: vi.fn() })),
}))

vi.mock('../../../hooks/useSwipeNavigation', () => ({
  useSwipeNavigation: vi.fn(() => ({ onTouchStart: vi.fn(), onTouchEnd: vi.fn() })),
}))

vi.mock('../../../lib/collectionUtils', () => ({
  buildNavOrder: vi.fn(() => [
    { id: 'song-1', title: 'Song One' },
    { id: 'song-2', title: 'Song Two' },
    { id: 'song-3', title: 'Song Three' },
  ]),
}))

vi.mock('../../../hooks/useScrollSettings', () => ({
  useScrollSettings: vi.fn(() => ({ targetDuration: 90, setTargetDuration: vi.fn() })),
}))

vi.mock('../../../hooks/useAutoScroll', () => ({
  useAutoScroll: vi.fn(() => ({ isScrolling: false, start: vi.fn(), stop: vi.fn() })),
}))

const fitStateBySong = {
  'song-1': {
    fitFontSize: 20, fitColumns: 3, paginated: true, totalColumns: 6, totalPages: 2,
    pageColWidth: 250, fitAvailableHeight: 600, shadowRef: { current: null },
    canIncrease: true, canDecrease: false, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
  },
  'song-2': {
    fitFontSize: 20, fitColumns: 3, paginated: true, totalColumns: 9, totalPages: 3,
    pageColWidth: 250, fitAvailableHeight: 600, shadowRef: { current: null },
    canIncrease: true, canDecrease: false, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
  },
  'song-3': {
    fitFontSize: 22, fitColumns: 2, paginated: false, totalColumns: null, totalPages: 1,
    pageColWidth: null, fitAvailableHeight: null, shadowRef: { current: null },
    canIncrease: true, canDecrease: true, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
  },
}

// Simulates useFitToScreen's own double-rAF self-correction: on 'song-1'
// specifically, the mock can report a first-pass totalPages that later
// changes to a corrected totalPages for the *same* song, without any
// song-cross in between — mirroring the real hook re-measuring shortly
// after mount/song-switch and updating its return value.
let song1Phase = 'first' // 'first' | 'corrected'
const song1FirstPass = fitStateBySong['song-1']
const song1Corrected = { ...song1FirstPass, totalColumns: 12, totalPages: 4 }

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(({ songId }) => {
    if (songId === 'song-1') return song1Phase === 'corrected' ? song1Corrected : song1FirstPass
    return fitStateBySong[songId] ?? fitStateBySong['song-2']
  }),
}))

vi.mock('../SongView', () => ({
  SongView: vi.fn(() => <div data-testid="song-view" />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

function renderMaximized() {
  const result = render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
    />
  )
  fireEvent.click(screen.getByLabelText('Fit song to screen'))
  return result
}

describe('MainContent maximize-mode pagination', () => {
  beforeEach(() => {
    currentSongId = 'song-2'
    mockSelectSong.mockClear()
    song1Phase = 'first'
  })

  it('shows a page indicator and pages forward before crossing to the next song', () => {
    renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 2 of 3')
    expect(mockSelectSong).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 3 of 3')
    expect(mockSelectSong).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-3')
  })

  it('paging backward from page 1 crosses to the previous song and lands on its last page', () => {
    renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')
    // song-1 has totalPages: 2 -> should land on page 2 of 2
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 2 of 2')
  })

  it('does not show a page indicator for a non-paginated song', () => {
    currentSongId = 'song-3'
    renderMaximized()
    expect(screen.queryByTestId('page-indicator')).not.toBeInTheDocument()
  })

  it('keeps landing on the last page when useFitToScreen self-corrects totalPages for the same song (double-rAF race)', () => {
    const { rerender } = renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    // Cross backward into song-1 while it's still reporting its first-pass
    // measurement (totalPages: 2) — should land on page 2 of 2.
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 2 of 2')

    // Simulate useFitToScreen's double-rAF self-correction: totalPages
    // changes for the *same* song (song-1) without any further song-cross.
    song1Phase = 'corrected'
    rerender(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )

    // Must still land on the (now corrected) last page, 4 of 4 — not reset
    // to page 1 just because the reset effect fired a second time for the
    // same song.
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 4 of 4')
  })
})
