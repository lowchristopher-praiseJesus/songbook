import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionDetailView } from '../CollectionDetailView'

const mockSetSelectedCollectionId = vi.fn()

const collectionsSeed = [
  { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] },
]

const storeState = {
  selectedCollectionId: 'c1',
  collections: collectionsSeed,
  index: [],
  setSelectedCollectionId: mockSetSelectedCollectionId,
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  duplicateCollection: vi.fn(),
  setCollectionSongs: vi.fn(),
  removeSongFromCollection: vi.fn(),
  applyShareRefresh: vi.fn(),
  selectSong: vi.fn(),
}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) => selector(storeState),
}))

vi.mock('../../UGImport/UGSearchModal', () => ({
  UGSearchModal: ({ isOpen, collectionId, onSongSelect }) =>
    isOpen ? (
      <div data-testid="ug-search-modal" data-collection-id={collectionId}>
        <button type="button" onClick={onSongSelect}>trigger-song-select</button>
      </div>
    ) : null,
}))

const defaultProps = {
  onAddToast: vi.fn(),
  onOpenSidebar: vi.fn(),
}

describe('CollectionDetailView Search UG button', () => {
  beforeEach(() => {
    mockSetSelectedCollectionId.mockReset()
  })

  it('does not show the Search UG modal by default', () => {
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.queryByTestId('ug-search-modal')).not.toBeInTheDocument()
  })

  it('renders a "Search UG" button', () => {
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Search UG' })).toBeInTheDocument()
  })

  it('clicking "Search UG" opens the modal scoped to the current collection', () => {
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search UG' }))
    const modal = screen.getByTestId('ug-search-modal')
    expect(modal).toHaveAttribute('data-collection-id', 'c1')
  })

  it('a successful import navigates away from the collection screen', () => {
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search UG' }))
    fireEvent.click(screen.getByText('trigger-song-select'))
    expect(mockSetSelectedCollectionId).toHaveBeenCalledWith(null)
  })
})
