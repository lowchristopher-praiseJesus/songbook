import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewAlbumCreator } from '../components/Album/NewAlbumCreator'

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    setIsCreatingNewAlbum: vi.fn(),
    setActiveAlbumCode: vi.fn(),
    syncAlbums: vi.fn(),
    index: [],
    collections: [],
  }),
}))

vi.mock('../lib/opfsClient', () => ({
  OPFSClient: { create: () => ({ terminate: vi.fn(), send: vi.fn() }) },
}))

vi.mock('../lib/albumApi', () => ({
  createAlbum: vi.fn(),
  uploadTrack: vi.fn(),
  saveAlbumLocally: vi.fn(),
  updateAlbumMeta: vi.fn(),
  updateAlbumCover: vi.fn(),
  updateAlbumLocally: vi.fn(),
  albumCoverUrl: (code) => `https://cdn.test/${code}/cover`,
}))

const existingAlbum = {
  albumCode: 'EDIT01',
  creatorToken: 'tok',
  title: 'My Album',
  artist: 'My Band',
  hasCover: false,
  createdAt: new Date().toISOString(),
  tracks: [
    { trackId: 't1', title: 'First Song', duration: 180000 },
    { trackId: 't2', title: 'Second Song', duration: 240000 },
  ],
}

describe('NewAlbumCreator — edit mode', () => {
  it('shows "Edit Album" heading when album prop is provided', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    expect(screen.getByText('Edit Album')).toBeDefined()
  })

  it('shows "Re-publish" button when album prop is provided', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    expect(screen.getByRole('button', { name: /re-publish/i })).toBeDefined()
  })

  it('pre-populates title input with album title', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    const titleInput = screen.getByPlaceholderText('Album title…')
    expect(titleInput.value).toBe('My Album')
  })

  it('pre-populates artist input with album artist', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    const artistInput = screen.getByPlaceholderText('Artist / group…')
    expect(artistInput.value).toBe('My Band')
  })

  it('pre-populates track list with existing album tracks', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    expect(screen.getByText('First Song')).toBeDefined()
    expect(screen.getByText('Second Song')).toBeDefined()
  })

  it('shows "New Album" heading when no album prop is provided', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByText('New Album')).toBeDefined()
  })

  it('shows "Publish Album" button when no album prop', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByRole('button', { name: /publish album/i })).toBeDefined()
  })
})
