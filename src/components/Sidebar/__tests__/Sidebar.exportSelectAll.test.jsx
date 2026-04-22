import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

const mockToggleGroupSelection = vi.fn()
const mockToggleExportMode = vi.fn()

const mockIndex = [
  { id: 's1', title: 'Amazing Grace', artist: 'Traditional' },
  { id: 's2', title: 'El Shaddai', artist: 'Amy Grant' },
]

let mockSelectedSongIds = new Set()

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: mockIndex,
      collections: [],
      isExportMode: true,
      selectedSongIds: mockSelectedSongIds,
      toggleExportMode: mockToggleExportMode,
      toggleGroupSelection: mockToggleGroupSelection,
      viewMode: 'collections',
      setViewMode: vi.fn(),
      createCollection: vi.fn(),
      duplicateCollection: vi.fn(),
      selectSong: vi.fn(),
      setExpandedCollectionId: vi.fn(),
      expandedCollectionId: null,
    }),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: () => ({ importFiles: vi.fn() }),
}))

vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../Share/ShareModal', () => ({ ShareModal: () => null }))
vi.mock('../ExportBackgroundModal', () => ({ ExportBackgroundModal: () => null }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))
vi.mock('../AllSongsList', () => ({ AllSongsList: () => <ul /> }))

const defaultProps = {
  isOpen: true,
  onAddToast: vi.fn(),
  onSongSelect: vi.fn(),
  onClose: vi.fn(),
  onImportSuccess: vi.fn(),
}

describe('Sidebar export mode — Select All', () => {
  beforeEach(() => {
    mockSelectedSongIds = new Set()
    mockToggleGroupSelection.mockReset()
    mockToggleExportMode.mockReset()
  })

  it('shows Select All button in export mode', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument()
  })

  it('clicking Select All calls toggleGroupSelection with all song ids', () => {
    render(<Sidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /select all/i }))
    expect(mockToggleGroupSelection).toHaveBeenCalledWith(['s1', 's2'])
  })

  it('shows Deselect All when all songs are selected', () => {
    mockSelectedSongIds = new Set(['s1', 's2'])
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /deselect all/i })).toBeInTheDocument()
  })

  it('clicking Deselect All calls toggleGroupSelection with all song ids', () => {
    mockSelectedSongIds = new Set(['s1', 's2'])
    render(<Sidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /deselect all/i }))
    expect(mockToggleGroupSelection).toHaveBeenCalledWith(['s1', 's2'])
  })
})
