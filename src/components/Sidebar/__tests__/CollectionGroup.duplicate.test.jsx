import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

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
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [{ id: 's1', title: 'Amazing Grace', artist: '' }],
}

const specialGroup = {
  id: '__uncategorized__',
  name: 'Uncategorized',
  entries: [],
}

describe('CollectionGroup duplicate button', () => {
  beforeEach(() => {
    mockIsExportMode = false
  })

  it('calls onDuplicate with the group id when ⧉ is clicked', () => {
    const onDuplicate = vi.fn()
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} onDuplicate={onDuplicate} /></ul>)
    fireEvent.click(screen.getByRole('button', { name: /Duplicate collection Sunday Set/i }))
    expect(onDuplicate).toHaveBeenCalledWith('col-1')
  })

  it('does not render ⧉ for the __uncategorized__ group', () => {
    render(<ul><CollectionGroup group={specialGroup} onSelect={vi.fn()} onDuplicate={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /Duplicate collection/i })).not.toBeInTheDocument()
  })

  it('does not render ⧉ in export mode', () => {
    mockIsExportMode = true
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} onDuplicate={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /Duplicate collection/i })).not.toBeInTheDocument()
  })
})
