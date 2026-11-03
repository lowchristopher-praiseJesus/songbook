import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

const mockDeleteCollection = vi.fn()
let mockCollections = []

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      deleteCollection: mockDeleteCollection,
      renameCollection: vi.fn(),
      setCollectionSongs: vi.fn(),
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleGroupSelection: vi.fn(),
      expandedCollectionId: null,
      collections: mockCollections,
      applyShareRefresh: vi.fn(),
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [{ id: 's1', title: 'Amazing Grace', artist: '' }, { id: 's2', title: 'Holy', artist: '' }],
}

const openDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: /delete collection sunday set/i }))

beforeEach(() => {
  vi.clearAllMocks()
  mockCollections = [{ id: 'col-1', name: 'Sunday Set', songIds: ['s1', 's2'] }]
})

describe('CollectionGroup delete — also delete songs option', () => {
  it('keeps songs by default', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    openDialog()
    expect(screen.getByRole('dialog')).toHaveTextContent(/2 songs will remain in your library/i)
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    expect(mockDeleteCollection).toHaveBeenCalledWith('col-1', { deleteSongs: false })
  })

  it('does nothing when cancelled', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(mockDeleteCollection).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('passes deleteSongs: true when the user ticks the checkbox', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    openDialog()
    fireEvent.click(screen.getByRole('checkbox', { name: /also delete 2 songs from my library/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete collection and songs/i }))
    expect(mockDeleteCollection).toHaveBeenCalledWith('col-1', { deleteSongs: true })
  })

  it('only counts songs not in another collection, and says the others are kept', () => {
    mockCollections = [
      { id: 'col-1', name: 'Sunday Set', songIds: ['s1', 's2'] },
      { id: 'col-2', name: 'Other', songIds: ['s2'] },
    ]
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    openDialog()
    fireEvent.click(screen.getByRole('checkbox', { name: /also delete 1 song from my library/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/1 song also in other collections will be kept/i)
  })

  it('hides the checkbox when every song is also in another collection', () => {
    mockCollections = [
      { id: 'col-1', name: 'Sunday Set', songIds: ['s1', 's2'] },
      { id: 'col-2', name: 'Other', songIds: ['s1', 's2'] },
    ]
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    openDialog()
    expect(screen.queryByRole('checkbox', { name: /also delete/i })).toBeNull()
  })
})
