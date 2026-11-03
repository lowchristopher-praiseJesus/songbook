import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionDetailView } from '../CollectionDetailView'

const mockDeleteCollection = vi.fn()
const mockSetSelectedCollectionId = vi.fn()

const storeState = {
  selectedCollectionId: 'c1',
  collections: [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] }],
  index: [{ id: 's1', title: 'Amazing Grace', artist: '' }],
  setSelectedCollectionId: mockSetSelectedCollectionId,
  renameCollection: vi.fn(),
  deleteCollection: mockDeleteCollection,
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
  UGSearchModal: () => null,
}))

const props = { onAddToast: vi.fn(), onOpenSidebar: vi.fn() }

beforeEach(() => vi.clearAllMocks())

describe('CollectionDetailView delete — also delete songs option', () => {
  it('keeps songs by default', () => {
    render(<CollectionDetailView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /delete collection/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    expect(mockDeleteCollection).toHaveBeenCalledWith('c1', { deleteSongs: false })
    expect(mockSetSelectedCollectionId).toHaveBeenCalledWith(null)
  })

  it('passes deleteSongs: true when the checkbox is ticked', () => {
    render(<CollectionDetailView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /delete collection/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /also delete 1 song from my library/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete collection and songs/i }))
    expect(mockDeleteCollection).toHaveBeenCalledWith('c1', { deleteSongs: true })
  })
})
