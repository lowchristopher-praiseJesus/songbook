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
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false, hasPin: false, expiresAt: '2026-08-30T00:00:00Z' }),
  fetchShare: vi.fn(),
}))
vi.mock('../../../lib/parser/sbpParser', () => ({ parseSbpFile: vi.fn() }))
vi.mock('../../../lib/mergeSharedCollection', () => ({ mergeSharedCollection: vi.fn() }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }))

import QRCode from 'qrcode'
import { checkShareVersion } from '../../../lib/shareApi'

const defaultProps = { onAddToast: vi.fn(), onOpenSidebar: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    value: { origin: 'https://songsheet.example' },
    writable: true,
  })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
})

describe('CollectionDetailView quick-share panel', () => {
  it('does not render the Share icon when the collection has no shareCode', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Share collection' })).not.toBeInTheDocument()
  })

  it('renders the Share icon when the collection has an unexpired shareCode', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Share collection' })).toBeInTheDocument()
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalledWith('abc123'))
  })

  it('clicking Share opens a panel with the share URL and renders a QR code for it', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share collection' }))
    expect(screen.getByDisplayValue('https://songsheet.example/?share=abc123')).toBeInTheDocument()
    await waitFor(() => expect(QRCode.toCanvas).toHaveBeenCalledWith(
      expect.anything(),
      'https://songsheet.example/?share=abc123',
      { width: 220, margin: 2 },
    ))
  })

  it('clicking Share again closes the panel', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalledWith('abc123'))
    const shareButton = screen.getByRole('button', { name: 'Share collection' })
    fireEvent.click(shareButton)
    expect(screen.getByDisplayValue('https://songsheet.example/?share=abc123')).toBeInTheDocument()
    fireEvent.click(shareButton)
    expect(screen.queryByDisplayValue('https://songsheet.example/?share=abc123')).not.toBeInTheDocument()
  })

  it('Copy button copies the share URL and shows a transient confirmation', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share collection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://songsheet.example/?share=abc123')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument())
  })
})
