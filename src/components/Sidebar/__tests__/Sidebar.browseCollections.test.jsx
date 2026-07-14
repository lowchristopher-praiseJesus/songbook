import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Sidebar } from '../Sidebar'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: [],
      collections: [],
      albums: [],
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleExportMode: vi.fn(),
      viewMode: 'collections',
      setViewMode: vi.fn(),
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
vi.mock('../ExportPresentationPptxModal', () => ({ ExportPresentationPptxModal: () => null }))
vi.mock('../ExportPrintModal', () => ({ ExportPrintModal: () => null }))
vi.mock('../../Session/LiveSessionModal', () => ({ LiveSessionModal: () => null }))
vi.mock('../../Conductor/BroadcastsPanel', () => ({ BroadcastsPanel: () => null }))
vi.mock('../../Album/AlbumsPanel', () => ({ AlbumsPanel: () => null }))
vi.mock('../../Collection/CollectionsPanel', () => ({ CollectionsPanel: () => null }))

let capturedProps
vi.mock('../../CommunityCollections/CollectionBrowseModal', () => ({
  CollectionBrowseModal: (props) => { capturedProps = props; return props.isOpen ? <div data-testid="collection-browse-modal" /> : null },
}))

describe('Sidebar — Browse Communities', () => {
  it('opens CollectionBrowseModal when the Browse Communities button is clicked', () => {
    render(<Sidebar isOpen onAddToast={vi.fn()} onSongSelect={vi.fn()} onClose={vi.fn()} onImportSuccess={vi.fn()} />)

    expect(screen.queryByTestId('collection-browse-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /browse communities/i }))
    expect(screen.getByTestId('collection-browse-modal')).toBeInTheDocument()
  })

  it('passes onAddToast and onImportSuccess through to the modal', () => {
    const onAddToast = vi.fn()
    const onImportSuccess = vi.fn()
    render(<Sidebar isOpen onAddToast={onAddToast} onSongSelect={vi.fn()} onClose={vi.fn()} onImportSuccess={onImportSuccess} />)

    fireEvent.click(screen.getByRole('button', { name: /browse communities/i }))
    expect(capturedProps.onAddToast).toBe(onAddToast)
    expect(capturedProps.onImportSuccess).toBe(onImportSuccess)
  })
})
