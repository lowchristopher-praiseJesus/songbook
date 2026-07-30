import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MainContent } from '../MainContent'
import { SongView } from '../SongView'
import { useLibraryStore } from '../../../store/libraryStore'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(),
}))

const mockSetSelectedCollectionId = vi.fn()

function mockStore(overrides = {}) {
  const state = {
    activeSong: { id: 'song-2', meta: { title: 'Song Two', keyIndex: 0 }, sections: [] },
    activeSongId: 'song-2',
    index: [],
    collections: [{ id: 'col-1', name: 'Sunday Worship', songIds: ['song-2'] }],
    activeCollectionId: 'col-1',
    selectSong: vi.fn(),
    editingSongId: null,
    setEditingSongId: vi.fn(),
    viewMode: 'collections',
    setSelectedCollectionId: mockSetSelectedCollectionId,
    ...overrides,
  }
  useLibraryStore.mockImplementation(selector => selector(state))
}

vi.mock('../../../hooks/useDropZone', () => ({
  useDropZone: vi.fn(() => ({ isDragging: false, onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() })),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: vi.fn(() => ({ importFiles: vi.fn() })),
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

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

beforeEach(() => {
  mockSetSelectedCollectionId.mockClear()
  SongView.mockClear()
  mockStore()
})

function renderMainContent() {
  render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
    />
  )
}

describe('MainContent back-to-collection wiring', () => {
  it('passes the active collection name to SongView', () => {
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    expect(props.collectionName).toBe('Sunday Worship')
  })

  it('passes an onBackToCollection handler that opens the collection detail view', () => {
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    props.onBackToCollection()
    expect(mockSetSelectedCollectionId).toHaveBeenCalledWith('col-1')
  })

  it('passes null collectionName when there is no active collection', () => {
    mockStore({ activeCollectionId: null })
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    expect(props.collectionName).toBeNull()
  })

  it('passes null collectionName when the active collection has been deleted', () => {
    mockStore({ activeCollectionId: 'col-deleted', collections: [] })
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    expect(props.collectionName).toBeNull()
  })
})
