import { render, screen, waitFor } from '@testing-library/react'
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
  checkShareVersion: vi.fn(),
  fetchShare: vi.fn(),
}))
vi.mock('../../../lib/parser/sbpParser', () => ({ parseSbpFile: vi.fn() }))
vi.mock('../../../lib/mergeSharedCollection', () => ({ mergeSharedCollection: vi.fn() }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))

import { checkShareVersion } from '../../../lib/shareApi'

const defaultProps = { onAddToast: vi.fn(), onOpenSidebar: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CollectionDetailView proactive expiration check', () => {
  it('does not call checkShareVersion when the collection has no shareCode', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(checkShareVersion).not.toHaveBeenCalled()
  })

  it('hides Check for updates and shows "Link expired" on mount when the link is already expired', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    checkShareVersion.mockRejectedValue(Object.assign(new Error('expired'), { code: 'expired' }))
    render(<CollectionDetailView {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Link expired')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument()
  })

  it('keeps Check for updates visible when the mount-time check reports the link is still valid', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    checkShareVersion.mockResolvedValue({ version: 1, locked: false, hasPin: false, expiresAt: '2026-08-30T00:00:00Z' })
    render(<CollectionDetailView {...defaultProps} />)
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalledWith('abc'))
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument()
    expect(screen.queryByText('Link expired')).not.toBeInTheDocument()
  })

  it('clears a stale "Link expired" flag when switching directly from an expired-link collection to one whose link is valid', async () => {
    collectionsSeed = [
      { id: 'c1', name: 'Expired Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'expired-code', lastVersion: 1 },
      { id: 'c2', name: 'Valid Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'valid-code', lastVersion: 1 },
    ]
    checkShareVersion.mockImplementation(code =>
      code === 'expired-code'
        ? Promise.reject(Object.assign(new Error('expired'), { code: 'expired' }))
        : Promise.resolve({ version: 1, locked: false, hasPin: false, expiresAt: '2026-08-30T00:00:00Z' })
    )
    storeState.selectedCollectionId = 'c1'
    const { rerender } = render(<CollectionDetailView {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Link expired')).toBeInTheDocument())

    // Simulate clicking straight from c1 to c2 in the sidebar — CollectionDetailView
    // stays mounted (same component instance), only selectedCollectionId changes.
    storeState.selectedCollectionId = 'c2'
    rerender(<CollectionDetailView {...defaultProps} />)

    await waitFor(() => expect(checkShareVersion).toHaveBeenCalledWith('valid-code'))
    await waitFor(() => expect(screen.queryByText('Link expired')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument()
  })
})
