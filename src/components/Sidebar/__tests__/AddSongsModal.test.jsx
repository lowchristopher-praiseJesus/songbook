import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddSongsModal } from '../AddSongsModal'

const mockSetCollectionSongs = vi.fn()

const mockIndex = [
  { id: 's1', title: 'Amazing Grace', artist: 'Traditional' },
  { id: 's2', title: 'El Shaddai', artist: 'Amy Grant' },
  { id: 's3', title: 'Oceans', artist: 'Hillsong' },
]

const mockCollections = [
  { id: 'c1', name: 'Sunday Set', songIds: ['s1'] },
  { id: 'c2', name: 'Worship Night', songIds: ['s3'] },
]

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: mockIndex,
      collections: mockCollections,
      setCollectionSongs: mockSetCollectionSongs,
    }),
}))

const defaultProps = {
  isOpen: true,
  collectionId: 'c1',
  collectionName: 'Sunday Set',
  onClose: vi.fn(),
}

describe('AddSongsModal', () => {
  beforeEach(() => {
    mockSetCollectionSongs.mockReset()
    defaultProps.onClose.mockReset()
  })

  it('renders all library songs', () => {
    render(<AddSongsModal {...defaultProps} />)
    expect(screen.getByLabelText(/Amazing Grace/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/El Shaddai/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Oceans/i)).toBeInTheDocument()
  })

  it('pre-checks songs already in the collection', () => {
    render(<AddSongsModal {...defaultProps} />)
    expect(screen.getByLabelText(/Amazing Grace/i)).toBeChecked()
    expect(screen.getByLabelText(/El Shaddai/i)).not.toBeChecked()
  })

  it('toggling a checkbox updates the selection', () => {
    render(<AddSongsModal {...defaultProps} />)
    const elShaddai = screen.getByLabelText(/El Shaddai/i)
    fireEvent.click(elShaddai)
    expect(elShaddai).toBeChecked()
    fireEvent.click(elShaddai)
    expect(elShaddai).not.toBeChecked()
  })

  it('Save calls setCollectionSongs with checked ids and closes', () => {
    render(<AddSongsModal {...defaultProps} />)
    // s1 is pre-checked; check s2 as well
    fireEvent.click(screen.getByLabelText(/El Shaddai/i))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mockSetCollectionSongs).toHaveBeenCalledWith('c1', expect.arrayContaining(['s1', 's2']))
    expect(mockSetCollectionSongs.mock.calls[0][1]).toHaveLength(2)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('Cancel does not call setCollectionSongs', () => {
    render(<AddSongsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockSetCollectionSongs).not.toHaveBeenCalled()
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('filter input hides non-matching songs', () => {
    render(<AddSongsModal {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'grace' } })
    expect(screen.getByLabelText(/Amazing Grace/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/El Shaddai/i)).not.toBeInTheDocument()
  })

  it('shows collection badge for songs in other collections', () => {
    render(<AddSongsModal {...defaultProps} />)
    // Oceans is in Worship Night (c2), not in Sunday Set (c1)
    expect(screen.getByText('Worship Night')).toBeInTheDocument()
  })
})
