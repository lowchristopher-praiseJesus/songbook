import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainContent } from '../MainContent'
import { setAnnotations } from '../../../lib/storage'

// Reproduces: in Maximize mode, swiping forward off the LAST page of a long,
// annotated song (e.g. 4 pages) into a shorter annotated song (e.g. 2 pages)
// left `currentPage` at its old, too-high index — showing "Page 4 of 2" and a
// blank page — because the reset effect in MainContent is gated on
// useFitToScreen's `settled`/`measuredSongId`, which never fire while
// useFitToScreen is disabled (i.e. whenever the active song has an
// annotation baseline).

const songs = {
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

// Both songs already have a captured baseline (as if the user had annotated
// each previously), so useFitToScreen is disabled for both and stays
// permanently unsettled — exactly the state that exposes this bug.
vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => ({
    fitFontSize: null, fitColumns: null, paginated: false, totalColumns: null, totalPages: 1,
    pageColWidth: null, fitAvailableHeight: null, shadowRef: { current: null },
    canIncrease: false, canDecrease: false, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
    settled: false, measuredSongId: null,
  })),
}))

vi.mock('../SongView', () => ({
  SongView: vi.fn(() => <div data-testid="song-view" />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

vi.mock('../../Annotation/AnnotationToolbar', () => ({
  AnnotationToolbar: vi.fn(() => <div data-testid="annotation-toolbar" />),
}))

function renderMaximized() {
  render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
    />
  )
  fireEvent.click(screen.getByLabelText('Fit song to screen'))
}

describe('MainContent pagination when swiping across songs with different baseline page counts', () => {
  beforeEach(() => {
    currentSongId = 'song-2'
    mockSelectSong.mockClear()
    localStorage.clear()
    setAnnotations('song-2', {
      baseline: { fontSize: 20, columns: 3, width: 800, height: 600, paginated: true, totalColumns: 12, totalPages: 4, pageColWidth: 250, availableHeight: 600 },
      layers: [], activeLayer: 0,
    })
    setAnnotations('song-3', {
      baseline: { fontSize: 20, columns: 3, width: 800, height: 600, paginated: true, totalColumns: 6, totalPages: 2, pageColWidth: 250, availableHeight: 600 },
      layers: [], activeLayer: 0,
    })
  })

  it('resets to page 1 when swiping forward off the last page into a shorter song', () => {
    renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 4')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 4 of 4')

    // Past the real last page of song-2, this should cross into song-3.
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-3')

    // song-3 only has 2 pages — must land on its page 1, not the stale index
    // carried over from song-2 ("Page 4 of 2" / a blank page).
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 2')
  })
})
