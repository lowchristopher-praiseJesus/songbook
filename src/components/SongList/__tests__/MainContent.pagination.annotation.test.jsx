import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MainContent } from '../MainContent'
import { useAnnotationStore } from '../../../store/annotationStore'

const mockSelectSong = vi.fn()

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector =>
    selector({
      activeSong: { id: 'song-2', meta: { title: 'Song Two', keyIndex: 0 }, sections: [] },
      activeSongId: 'song-2',
      index: [],
      collections: [],
      selectSong: mockSelectSong,
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

// Mirrors useFitToScreen's real behavior of resetting to the "disabled"
// defaults (totalPages: 1, paginated: false) whenever `enabled` is false —
// which is exactly what happens once `annotationBaseline` is set, since
// MainContent wires `enabled: isFit && !annotationBaseline`.
vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(({ enabled }) => {
    if (!enabled) {
      return {
        fitFontSize: null, fitColumns: null, paginated: false, totalColumns: null, totalPages: 1,
        pageColWidth: null, fitAvailableHeight: null, shadowRef: { current: null },
        canIncrease: false, canDecrease: false, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
        settled: false, measuredSongId: null,
      }
    }
    return {
      fitFontSize: 20, fitColumns: 3, paginated: true, totalColumns: 9, totalPages: 3,
      pageColWidth: 250, fitAvailableHeight: 600, shadowRef: { current: null },
      canIncrease: true, canDecrease: false, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
      settled: true, measuredSongId: 'song-2',
    }
  }),
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

describe('MainContent pagination survives capturing an annotation baseline', () => {
  beforeEach(() => {
    mockSelectSong.mockClear()
    useAnnotationStore.setState({
      songId: null,
      baseline: null,
      annotateMode: false,
      layers: useAnnotationStore.getState().layers.map(l => ({ ...l, strokes: [] })),
    })
  })

  it('keeps paging within a multi-page song after the first stroke captures a baseline', () => {
    renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    // Simulate what AnnotationLayer.onPointerUp does on the first completed
    // stroke: captureBaseline freezes the live fit result, including its
    // pagination shape, so useFitToScreen can be safely disabled afterward.
    act(() => {
      useAnnotationStore.getState().captureBaseline({
        fontSize: 20,
        columns: 3,
        width: 800,
        height: 600,
        paginated: true,
        totalColumns: 9,
        totalPages: 3,
        pageColWidth: 250,
        availableHeight: 600,
      })
    })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 2 of 3')
    expect(mockSelectSong).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 3 of 3')
    expect(mockSelectSong).not.toHaveBeenCalled()

    // Only past the real last page should it cross to the next song.
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-3')
  })
})
