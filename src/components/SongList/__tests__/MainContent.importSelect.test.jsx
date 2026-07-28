import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { MainContent } from '../MainContent'

// The bug: importing from the main-area EmptyState stored the songs but left
// the view on "No songs yet" — unlike the Sidebar import path, which selects
// the first imported song. These tests pin the EmptyState path to the same
// behavior by capturing the options MainContent hands useFileImport and
// invoking its onSuccess directly.

let libraryState = {}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector => selector(libraryState)),
}))

vi.mock('../../../hooks/useDropZone', () => ({
  useDropZone: vi.fn(() => ({ isDragging: false, onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() })),
}))

let capturedImportOptions = null
vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: vi.fn(opts => {
    capturedImportOptions = opts
    return { importFiles: vi.fn() }
  }),
}))

vi.mock('../../../hooks/useSwipeNavigation', () => ({
  useSwipeNavigation: vi.fn(() => ({ onTouchStart: vi.fn(), onTouchEnd: vi.fn() })),
}))

vi.mock('../../../lib/collectionUtils', () => ({
  buildNavOrder: vi.fn(() => []),
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

vi.mock('../SongView', () => ({
  SongView: vi.fn(() => <div data-testid="song-view" />),
}))

vi.mock('../../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => <div data-testid="performance-modal" />),
}))

function renderMainContent(props = {}) {
  return render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
      {...props}
    />
  )
}

beforeEach(() => {
  capturedImportOptions = null
  libraryState = {
    activeSong: null,
    activeSongId: null,
    index: [],
    collections: [],
    selectSong: vi.fn(),
    setViewMode: vi.fn(),
    setExpandedCollectionId: vi.fn(),
    editingSongId: null,
    setEditingSongId: vi.fn(),
    viewMode: 'allSongs',
  }
})

describe('MainContent import selects the imported song', () => {
  it('selects the first imported song and shows All Songs after a plain import', () => {
    renderMainContent()
    act(() => {
      capturedImportOptions.onSuccess({ newSongIds: ['new-1', 'new-2'], collectionId: null })
    })
    expect(libraryState.selectSong).toHaveBeenCalledWith('new-1')
    expect(libraryState.setViewMode).toHaveBeenCalledWith('allSongs')
  })

  it('expands the collection when the import created one', () => {
    renderMainContent()
    act(() => {
      capturedImportOptions.onSuccess({ newSongIds: ['new-1'], collectionId: 'col-1' })
    })
    expect(libraryState.setViewMode).toHaveBeenCalledWith('collections')
    expect(libraryState.setExpandedCollectionId).toHaveBeenCalledWith('col-1')
    expect(libraryState.selectSong).toHaveBeenCalledWith('new-1')
  })

  it('selects nothing when no new songs were imported (all skipped)', () => {
    renderMainContent()
    act(() => {
      capturedImportOptions.onSuccess({ newSongIds: [], collectionId: null })
    })
    expect(libraryState.selectSong).not.toHaveBeenCalled()
  })

  it('still notifies the parent via onImportSuccess', () => {
    const onImportSuccess = vi.fn()
    renderMainContent({ onImportSuccess })
    act(() => {
      capturedImportOptions.onSuccess({ newSongIds: ['new-1'], collectionId: null })
    })
    expect(onImportSuccess).toHaveBeenCalled()
  })
})
