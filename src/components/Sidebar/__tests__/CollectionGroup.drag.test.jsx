import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

let capturedOnDragEnd = null
const mockSetCollectionSongs = vi.fn()

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }) => {
    capturedOnDragEnd = onDragEnd
    return <>{children}</>
  },
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: { onPointerDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  arrayMove: (arr, oldIndex, newIndex) => {
    const result = [...arr]
    const [item] = result.splice(oldIndex, 1)
    result.splice(newIndex, 0, item)
    return result
  },
  verticalListSortingStrategy: 'vertical',
  sortableKeyboardCoordinates: vi.fn(),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      deleteCollection: vi.fn(),
      renameCollection: vi.fn(),
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleGroupSelection: vi.fn(),
      expandedCollectionId: null,
      setCollectionSongs: mockSetCollectionSongs,
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry, dragHandleListeners }) => (
    <li data-testid="song-item">
      {dragHandleListeners && <span data-testid="drag-handle">⠿</span>}
      {entry.title}
    </li>
  ),
}))

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [
    { id: 's1', title: 'Amazing Grace', artist: '' },
    { id: 's2', title: 'Blessed Be', artist: '' },
  ],
}

describe('CollectionGroup drag-and-drop', () => {
  beforeEach(() => {
    capturedOnDragEnd = null
    mockSetCollectionSongs.mockClear()
  })

  it('renders drag handles on each song in a real collection', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    expect(screen.getAllByTestId('drag-handle')).toHaveLength(2)
  })

  it('calls setCollectionSongs with reordered ids when drag ends', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    act(() => {
      capturedOnDragEnd({ active: { id: 's2' }, over: { id: 's1' } })
    })
    expect(mockSetCollectionSongs).toHaveBeenCalledWith('col-1', ['s2', 's1'])
  })

  it('does not call setCollectionSongs when dropped on the same item', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    act(() => {
      capturedOnDragEnd({ active: { id: 's1' }, over: { id: 's1' } })
    })
    expect(mockSetCollectionSongs).not.toHaveBeenCalled()
  })

  it('does not call setCollectionSongs when dropped outside the list', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    act(() => {
      capturedOnDragEnd({ active: { id: 's1' }, over: null })
    })
    expect(mockSetCollectionSongs).not.toHaveBeenCalled()
  })
})

describe('CollectionGroup drag disabled for uncategorized', () => {
  it('does not render drag handles for the __uncategorized__ group', () => {
    const uncatGroup = {
      id: '__uncategorized__',
      name: 'Uncategorized',
      entries: [{ id: 's1', title: 'Amazing Grace', artist: '' }],
    }
    render(<ul><CollectionGroup group={uncatGroup} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Uncategorized'))
    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument()
  })
})
