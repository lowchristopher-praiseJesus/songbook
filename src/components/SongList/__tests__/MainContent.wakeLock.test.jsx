import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MainContent } from '../MainContent'
import { useWakeLock } from '../../../hooks/useWakeLock'

// Wiring test: MainContent must hold a screen wake lock while auto-scroll is
// running so the device doesn't sleep mid-song on a music stand.

const song1 = { id: 'song-1', meta: { title: 'Test One', artist: 'Someone', keyIndex: 0 }, sections: [] }

let libraryState = {}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector => selector(libraryState)),
}))

vi.mock('../../../hooks/useWakeLock', () => ({
  useWakeLock: vi.fn(),
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
  buildNavOrder: vi.fn(() => []),
}))

vi.mock('../../../hooks/useScrollSettings', () => ({
  useScrollSettings: vi.fn(() => ({ targetDuration: 90, setTargetDuration: vi.fn() })),
}))

let autoScrollState = { isScrolling: false, start: vi.fn(), stop: vi.fn() }
vi.mock('../../../hooks/useAutoScroll', () => ({
  useAutoScroll: vi.fn(() => autoScrollState),
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

function renderMainContent() {
  return render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
    />
  )
}

beforeEach(() => {
  vi.mocked(useWakeLock).mockClear()
  libraryState = {
    activeSong: song1,
    activeSongId: 'song-1',
    index: [],
    collections: [],
    selectSong: vi.fn(),
    editingSongId: null,
    setEditingSongId: vi.fn(),
    viewMode: 'allSongs',
  }
})

describe('MainContent wake lock wiring', () => {
  it('does not hold a wake lock while idle', () => {
    autoScrollState = { isScrolling: false, start: vi.fn(), stop: vi.fn() }
    renderMainContent()
    expect(useWakeLock).toHaveBeenCalledWith(false)
  })

  it('holds a wake lock while auto-scroll is running', () => {
    autoScrollState = { isScrolling: true, start: vi.fn(), stop: vi.fn() }
    renderMainContent()
    expect(useWakeLock).toHaveBeenCalledWith(true)
  })
})
