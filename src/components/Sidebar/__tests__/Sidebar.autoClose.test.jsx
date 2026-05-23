import { render, screen } from '@testing-library/react'
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
      toggleGroupSelection: vi.fn(),
      viewMode: 'collections',
      setViewMode: vi.fn(),
      setIsCreatingNewSong: vi.fn(),
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
vi.mock('../ExportPrintModal', () => ({ ExportPrintModal: () => null }))
vi.mock('../AllSongsList', () => ({ AllSongsList: () => <ul data-testid="all-songs-list" /> }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null), getTransposeState: vi.fn(() => null) }))
vi.mock('../../Session/LiveSessionModal', () => ({ LiveSessionModal: () => null }))
vi.mock('../../Conductor/BroadcastsPanel', () => ({ BroadcastsPanel: () => null }))

const defaultProps = {
  isOpen: true,
  onAddToast: vi.fn(),
  onSongSelect: vi.fn(),
  onClose: vi.fn(),
  onImportSuccess: vi.fn(),
  conductorSync: {},
}

describe('Sidebar auto-close progress bar', () => {
  it('renders the progress bar when isAutoClosing is true', () => {
    render(<Sidebar {...defaultProps} isAutoClosing={true} />)
    expect(screen.getByTestId('auto-close-bar')).toBeInTheDocument()
  })

  it('does not render the progress bar when isAutoClosing is false', () => {
    render(<Sidebar {...defaultProps} isAutoClosing={false} />)
    expect(screen.queryByTestId('auto-close-bar')).not.toBeInTheDocument()
  })

  it('does not render the progress bar when isAutoClosing is omitted', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.queryByTestId('auto-close-bar')).not.toBeInTheDocument()
  })
})
