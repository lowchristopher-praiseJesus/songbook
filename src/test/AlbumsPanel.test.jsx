import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlbumsPanel } from '../components/Album/AlbumsPanel'

const mockSetIsCreatingNewAlbum = vi.fn()

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    albums: [],
    syncAlbums: vi.fn(),
    setIsCreatingNewAlbum: mockSetIsCreatingNewAlbum,
  }),
}))

describe('AlbumsPanel', () => {
  it('clicking New Album calls setIsCreatingNewAlbum(true) and onNewAlbum prop', () => {
    const onNewAlbum = vi.fn()
    render(<AlbumsPanel onSelect={vi.fn()} onNewAlbum={onNewAlbum} />)
    fireEvent.click(screen.getByText(/\+ New Album/i))
    expect(mockSetIsCreatingNewAlbum).toHaveBeenCalledWith(true)
    expect(onNewAlbum).toHaveBeenCalled()
  })

  it('does not render AlbumCreatorModal', () => {
    render(<AlbumsPanel onSelect={vi.fn()} onNewAlbum={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
