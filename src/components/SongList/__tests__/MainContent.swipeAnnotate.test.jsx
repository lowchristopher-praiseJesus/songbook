import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainContent } from '../MainContent'

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

// useSwipeNavigation is intentionally NOT mocked here — this test exercises
// its real touchstart/touchend logic to prove that touch events originating
// inside the maximize overlay while annotating don't reach <main>'s swipe
// handlers via bubbling.

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

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => ({
    fitFontSize: 18,
    fitColumns: 2,
    shadowRef: { current: null },
    canIncrease: true,
    canDecrease: true,
    increaseFontSize: vi.fn(),
    decreaseFontSize: vi.fn(),
  })),
}))

vi.mock('../../../hooks/useNativeFullscreen', () => ({
  useNativeFullscreen: vi.fn(() => ({ isSupported: true, requestFullscreen: vi.fn(), exitFullscreen: vi.fn() })),
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

function swipeOn(element, fromX, toX, y = 100) {
  fireEvent.touchStart(element, { touches: [{ clientX: fromX, clientY: y }] })
  fireEvent.touchEnd(element, { changedTouches: [{ clientX: toX, clientY: y }] })
}

describe('MainContent swipe navigation while annotating', () => {
  beforeEach(() => {
    mockSelectSong.mockClear()
  })

  it('sanity check: a swipe-like gesture on the overlay navigates when NOT annotating', () => {
    renderMaximized()
    const overlay = screen.getByTestId('maximize-overlay')

    swipeOn(overlay, 300, 100) // leftward, 200px

    expect(mockSelectSong).toHaveBeenCalledWith('song-3')
  })

  it('does not navigate when the same gesture originates inside the maximize overlay while annotating', () => {
    renderMaximized()
    fireEvent.click(screen.getByLabelText('Annotate'))
    const overlay = screen.getByTestId('maximize-overlay')

    swipeOn(overlay, 300, 100) // leftward, 200px — same gesture as the sanity check

    expect(mockSelectSong).not.toHaveBeenCalled()
  })
})
