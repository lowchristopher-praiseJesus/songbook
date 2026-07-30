import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionDetailView } from '../CollectionDetailView'

let collectionsSeed = []

const storeState = {
  selectedCollectionId: 'c1',
  get collections() { return collectionsSeed },
  index: [],
  setSelectedCollectionId: vi.fn(),
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
vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../../lib/conductorApi', () => ({ endBroadcast: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../../../lib/shareApi', () => ({
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1 }),
  fetchShare: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
}))
vi.mock('../../../lib/parser/sbpParser', () => ({
  parseSbpFile: vi.fn().mockResolvedValue({ songs: [] }),
}))
vi.mock('../../../lib/mergeSharedCollection', () => ({
  mergeSharedCollection: vi.fn().mockReturnValue({
    autoApplied: [], conflicts: [], newSongs: [], removed: [], serverSbpIdOrder: [],
  }),
}))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))

import { checkShareVersion } from '../../../lib/shareApi'

const defaultProps = { onAddToast: vi.fn(), onOpenSidebar: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  checkShareVersion.mockResolvedValue({ version: 1 })
})

describe('CollectionDetailView action icon row', () => {
  it('renders Rename and Duplicate icons but not Check for updates when there is no shareCode', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Rename collection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate collection' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument()
  })

  it('renders the Check for updates icon when the collection has a shareCode', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument()
  })

  it('clicking the Rename icon replaces the title with an editable input and hides the icon', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename collection' }))
    expect(screen.getByDisplayValue('Sunday Set')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename collection' })).not.toBeInTheDocument()
  })

  it('clicking the Duplicate icon shows the inline duplicate-name input and hides the icon', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate collection' }))
    expect(screen.getByPlaceholderText('New collection name…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate collection' })).not.toBeInTheDocument()
  })

  it('clicking Check for updates triggers a version check for that shareCode', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalledWith('abc'))
  })

  it('Delete Collection remains a full-width labeled button, not an icon', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Delete Collection' })).toBeInTheDocument()
  })
})
