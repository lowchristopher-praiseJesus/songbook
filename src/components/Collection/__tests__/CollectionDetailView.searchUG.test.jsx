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

vi.mock('../../Sidebar/AddSongsModal', () => ({
  AddSongsModal: ({ isOpen, collectionId }) =>
    isOpen ? <div data-testid="add-songs-modal" data-collection-id={collectionId} /> : null,
}))

const defaultProps = {
  onAddToast: vi.fn(),
  onOpenSidebar: vi.fn(),
}

// Add Songs and Search Songs were merged into one dialog that searches the
// library and online sources together.
describe('CollectionDetailView Add Songs button', () => {
  beforeEach(() => {
    mockSetSelectedCollectionId.mockReset()
  })

  it('no longer shows a separate "Search Songs" button', () => {
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Search Songs' })).not.toBeInTheDocument()
  })

  it('does not show the Add Songs dialog by default', () => {
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.queryByTestId('add-songs-modal')).not.toBeInTheDocument()
  })

  it('clicking "Add Songs" opens the merged dialog scoped to the current collection', () => {
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Songs' }))
    expect(screen.getByTestId('add-songs-modal')).toHaveAttribute('data-collection-id', 'c1')
  })
})
