import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Sidebar } from '../Sidebar'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: [],
      collections: [],
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleExportMode: vi.fn(),
      toggleGroupSelection: vi.fn(),
      viewMode: 'collections',
      setViewMode: vi.fn(),
      selectSong: vi.fn(),
      setExpandedCollectionId: vi.fn(),
      expandedCollectionId: null,
      albums: [],
    }),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: () => ({ importFiles: vi.fn() }),
}))

vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../Share/ShareModal', () => ({ ShareModal: () => null }))
vi.mock('../ExportBackgroundModal', () => ({ ExportBackgroundModal: () => null }))
vi.mock('../ExportPrintModal', () => ({ ExportPrintModal: () => null }))
vi.mock('../../Session/LiveSessionModal', () => ({ LiveSessionModal: () => null }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null), getTransposeState: vi.fn(() => null) }))
vi.mock('../AllSongsList', () => ({ AllSongsList: () => <ul data-testid="all-songs-list" /> }))
vi.mock('../../Conductor/BroadcastsPanel', () => ({ BroadcastsPanel: () => null }))
vi.mock('../../Album/AlbumsPanel', () => ({ AlbumsPanel: () => null }))
vi.mock('../../Album/AlbumCard', () => ({ AlbumCard: () => null }))

vi.mock('../../Collection/CollectionsPanel', () => ({
  CollectionsPanel: ({ onGroupCheckboxChange }) => (
    <div data-testid="collections-panel" data-has-cb={!!onGroupCheckboxChange} />
  ),
}))
vi.mock('../../Collection/CollectionCard', () => ({ CollectionCard: () => null }))

const defaultProps = {
  isOpen: true,
  onAddToast: vi.fn(),
  onSongSelect: vi.fn(),
  onClose: vi.fn(),
  onImportSuccess: vi.fn(),
}

describe('Sidebar collections view', () => {
  it('renders CollectionsPanel (not inline CollectionGroup) in collections mode', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByTestId('collections-panel')).toBeInTheDocument()
  })

  it('passes onGroupCheckboxChange to CollectionsPanel', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByTestId('collections-panel').dataset.hasCb).toBe('true')
  })
})
