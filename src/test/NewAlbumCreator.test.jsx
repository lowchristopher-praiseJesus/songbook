import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewAlbumCreator } from '../components/Album/NewAlbumCreator'

const mockSetIsCreatingNewAlbum = vi.fn()
const mockSetActiveAlbumCode = vi.fn()
const mockSyncAlbums = vi.fn()

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    setIsCreatingNewAlbum: mockSetIsCreatingNewAlbum,
    setActiveAlbumCode: mockSetActiveAlbumCode,
    syncAlbums: mockSyncAlbums,
    index: [],
    collections: [],
  }),
}))

vi.mock('../lib/opfsClient', () => ({
  OPFSClient: {
    create: () => ({
      send: vi.fn().mockResolvedValue([]),
      terminate: vi.fn(),
    }),
  },
}))

vi.mock('../lib/albumApi', () => ({
  createAlbum: vi.fn(),
  uploadTrack: vi.fn(),
  saveAlbumLocally: vi.fn(),
}))

describe('NewAlbumCreator', () => {
  beforeEach(() => {
    mockSetIsCreatingNewAlbum.mockClear()
    mockSetActiveAlbumCode.mockClear()
    mockSyncAlbums.mockClear()
  })

  it('renders title input, artist input, and Publish button', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByPlaceholderText(/album title/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/artist/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /publish album/i })).toBeDefined()
  })

  it('Cancel calls setIsCreatingNewAlbum(false)', () => {
    render(<NewAlbumCreator />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockSetIsCreatingNewAlbum).toHaveBeenCalledWith(false)
  })

  it('Publish button is disabled when no tracks selected', () => {
    render(<NewAlbumCreator />)
    const btn = screen.getByRole('button', { name: /publish album/i })
    expect(btn.disabled).toBe(true)
  })

  it('shows Collections and Songs tabs', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByText('Collections')).toBeDefined()
    expect(screen.getByText('Songs')).toBeDefined()
  })
})
