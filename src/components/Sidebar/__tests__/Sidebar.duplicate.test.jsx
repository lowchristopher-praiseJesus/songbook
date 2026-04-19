import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

const mockDuplicateCollection = vi.fn()
const mockCreateCollection = vi.fn()

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: [],
      collections: [],
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleExportMode: vi.fn(),
      viewMode: 'collections',
      setViewMode: vi.fn(),
      createCollection: mockCreateCollection,
      duplicateCollection: mockDuplicateCollection,
      selectSong: vi.fn(),
      setExpandedCollectionId: vi.fn(),
      expandedCollectionId: null,
    }),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: () => ({ importFiles: vi.fn() }),
}))

vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../Share/ShareModal', () => ({ ShareModal: () => null }))
vi.mock('../ExportBackgroundModal', () => ({ ExportBackgroundModal: () => null }))
vi.mock('../../Session/LiveSessionModal', () => ({ LiveSessionModal: () => null }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null), getTransposeState: vi.fn(() => null) }))
vi.mock('../AllSongsList', () => ({ AllSongsList: () => <ul data-testid="all-songs-list" /> }))
vi.mock('../AddSongsModal', () => ({ AddSongsModal: () => null }))

let capturedOnDuplicate

vi.mock('../CollectionGroup', () => ({
  CollectionGroup: ({ group, onDuplicate }) => {
    capturedOnDuplicate = onDuplicate
    return <li data-testid={`group-${group.id}`}>{group.name}</li>
  },
}))

vi.mock('../../../lib/collectionUtils', () => ({
  buildGroups: vi.fn(() => [
    { id: 'col-1', name: 'Sunday Set', entries: [{ id: 's1', title: 'Grace', artist: '' }] },
  ]),
}))

const defaultProps = {
  isOpen: true,
  onAddToast: vi.fn(),
  onSongSelect: vi.fn(),
  onClose: vi.fn(),
  onImportSuccess: vi.fn(),
}

describe('Sidebar duplicate collection flow', () => {
  beforeEach(() => {
    capturedOnDuplicate = null
    mockDuplicateCollection.mockReset()
    mockCreateCollection.mockReset()
  })

  it('shows inline input pre-filled with "Copy of {name}" when onDuplicate fires', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    expect(input.value).toBe('Copy of Sunday Set')
  })

  it('calls duplicateCollection with sourceId and trimmed name on Enter', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.change(input, { target: { value: 'My Duplicate' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockDuplicateCollection).toHaveBeenCalledWith('col-1', 'My Duplicate')
  })

  it('hides the input after Enter', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByPlaceholderText('Collection name…')).not.toBeInTheDocument()
  })

  it('hides the input on Escape without calling duplicateCollection', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockDuplicateCollection).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Collection name…')).not.toBeInTheDocument()
  })

  it('calls duplicateCollection on blur with non-empty value', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.change(input, { target: { value: 'Blur Copy' } })
    fireEvent.blur(input)
    expect(mockDuplicateCollection).toHaveBeenCalledWith('col-1', 'Blur Copy')
    expect(screen.queryByPlaceholderText('Collection name…')).not.toBeInTheDocument()
  })

  it('does not call duplicateCollection on blur with empty value', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(mockDuplicateCollection).not.toHaveBeenCalled()
  })
})
