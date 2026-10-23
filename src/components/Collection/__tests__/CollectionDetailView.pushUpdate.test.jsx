import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionDetailView } from '../CollectionDetailView'

let collectionsSeed = []
const mockRecordSharePush = vi.fn()

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
  recordSharePush: mockRecordSharePush,
  selectSong: vi.fn(),
}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) => selector(storeState),
}))
vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../../lib/conductorApi', () => ({ endBroadcast: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../../../lib/shareApi', () => ({
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false, hasPin: false }),
  fetchShare: vi.fn(),
}))
vi.mock('../../../lib/parser/sbpParser', () => ({ parseSbpFile: vi.fn() }))
vi.mock('../../../lib/mergeSharedCollection', () => ({ mergeSharedCollection: vi.fn() }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))
vi.mock('../../../lib/pushCollectionUpdate', () => ({ pushCollectionUpdate: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }))

import { pushCollectionUpdate } from '../../../lib/pushCollectionUpdate'

const onAddToast = vi.fn()
const defaultProps = { onAddToast, onOpenSidebar: vi.fn() }

const shared = {
  id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z',
  songIds: ['s1'], shareCode: 'abc', shareLyricsOnly: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  collectionsSeed = [shared]
  pushCollectionUpdate.mockResolvedValue({ version: 5 })
})

describe('CollectionDetailView — one-click Push Update', () => {
  it('does not offer Push Update for a collection that has never been shared', () => {
    collectionsSeed = [{ ...shared, shareCode: undefined }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Push update' })).not.toBeInTheDocument()
  })

  it('pushes the collection and records the push in one click', async () => {
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Push update' }))
    await waitFor(() => expect(onAddToast).toHaveBeenCalledWith('Pushed update (v5)', 'success'))
    expect(pushCollectionUpdate).toHaveBeenCalledWith(shared)
    expect(mockRecordSharePush).toHaveBeenCalledWith('c1', { version: 5, shareLyricsOnly: true })
  })

  it('disables the button while the push is in flight', async () => {
    pushCollectionUpdate.mockReturnValue(new Promise(() => {}))
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Push update' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Push update' })).toBeDisabled())
  })

  it('explains a locked link instead of failing silently', async () => {
    pushCollectionUpdate.mockRejectedValue(Object.assign(new Error('locked'), { code: 'locked' }))
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Push update' }))
    await waitFor(() => expect(onAddToast).toHaveBeenCalledWith(
      'This link is locked. Unlock it in Share via link before pushing updates.', 'error',
    ))
    expect(mockRecordSharePush).not.toHaveBeenCalled()
  })

  it('marks the link expired when the server says so', async () => {
    pushCollectionUpdate.mockRejectedValue(Object.assign(new Error('expired'), { code: 'expired' }))
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Push update' }))
    expect(await screen.findByText('Link expired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Push update' })).not.toBeInTheDocument()
  })

  it('shows a generic error for other failures', async () => {
    pushCollectionUpdate.mockRejectedValue(new Error('network'))
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Push update' }))
    await waitFor(() => expect(onAddToast).toHaveBeenCalledWith(
      'Update failed. Please check your connection and try again.', 'error',
    ))
  })
})
