import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

let mockExpandedCollectionId = null

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      deleteCollection: vi.fn(),
      renameCollection: vi.fn(),
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleGroupSelection: vi.fn(),
      expandedCollectionId: mockExpandedCollectionId,
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [
    { id: 's1', title: 'Amazing Grace', artist: '' },
    { id: 's2', title: 'Blessed Be', artist: '' },
  ],
}

describe('CollectionGroup auto-expand', () => {
  beforeEach(() => {
    mockExpandedCollectionId = null
  })

  it('starts collapsed by default', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByTestId('song-item')).not.toBeInTheDocument()
  })

  it('expands when expandedCollectionId matches group.id', () => {
    mockExpandedCollectionId = 'col-1'
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    expect(screen.getAllByTestId('song-item')).toHaveLength(2)
  })

  it('does not expand when expandedCollectionId is a different id', () => {
    mockExpandedCollectionId = 'col-99'
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByTestId('song-item')).not.toBeInTheDocument()
  })
})
