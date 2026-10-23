import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

const mockRecordSharePush = vi.fn()
let mockCollections = []
let mockIsExportMode = false

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      deleteCollection: vi.fn(),
      renameCollection: vi.fn(),
      setCollectionSongs: vi.fn(),
      isExportMode: mockIsExportMode,
      selectedSongIds: new Set(),
      toggleGroupSelection: vi.fn(),
      expandedCollectionId: null,
      collections: mockCollections,
      applyShareRefresh: vi.fn(),
      recordSharePush: mockRecordSharePush,
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))
vi.mock('../../../lib/conductorApi', () => ({ endBroadcast: vi.fn() }))
vi.mock('../../../lib/pushCollectionUpdate', () => ({ pushCollectionUpdate: vi.fn() }))

import { pushCollectionUpdate } from '../../../lib/pushCollectionUpdate'

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [{ id: 's1', title: 'Amazing Grace', artist: '' }],
}
const shared = { id: 'col-1', name: 'Sunday Set', songIds: ['s1'], shareCode: 'abc' }
const onAddToast = vi.fn()

function renderGroup() {
  return render(<ul><CollectionGroup group={group} onSelect={vi.fn()} onAddToast={onAddToast} /></ul>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCollections = [shared]
  mockIsExportMode = false
  pushCollectionUpdate.mockResolvedValue({ version: 3 })
})

describe('CollectionGroup — one-click Push Update', () => {
  it('is not offered for a collection that has never been shared', () => {
    mockCollections = [{ ...shared, shareCode: undefined }]
    renderGroup()
    expect(screen.queryByRole('button', { name: 'Push update to Sunday Set' })).not.toBeInTheDocument()
  })

  it('is hidden in export mode', () => {
    mockIsExportMode = true
    renderGroup()
    expect(screen.queryByRole('button', { name: 'Push update to Sunday Set' })).not.toBeInTheDocument()
  })

  it('pushes without expanding the collection', async () => {
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'Push update to Sunday Set' }))
    await waitFor(() => expect(onAddToast).toHaveBeenCalledWith('Pushed update (v3)', 'success'))
    expect(pushCollectionUpdate).toHaveBeenCalledWith(shared)
    expect(mockRecordSharePush).toHaveBeenCalledWith('col-1', { version: 3, shareLyricsOnly: false })
    expect(screen.queryByTestId('song-item')).not.toBeInTheDocument()
  })

  it('shows "Link expired" when the server reports the link expired', async () => {
    pushCollectionUpdate.mockRejectedValue(Object.assign(new Error('expired'), { code: 'expired' }))
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'Push update to Sunday Set' }))
    expect(await screen.findByText('Link expired')).toBeInTheDocument()
  })
})
