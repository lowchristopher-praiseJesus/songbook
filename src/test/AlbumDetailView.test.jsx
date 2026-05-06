import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlbumDetailView } from '../components/Album/AlbumDetailView'

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    setActiveAlbumCode: vi.fn(),
    syncAlbums: vi.fn(),
  }),
}))

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('../lib/albumApi', () => ({ deleteAlbum: vi.fn(), removeAlbumLocally: vi.fn() }))

const album = {
  albumCode: 'TEST01',
  creatorToken: 'tok',
  title: 'Sunday Worship',
  artist: 'SMTB',
  createdAt: new Date().toISOString(),
  tracks: [{ trackId: 't1', title: 'Amazing Grace', duration: 192000 }],
}

describe('AlbumDetailView', () => {
  it('renders Open Album link with correct href', () => {
    render(<AlbumDetailView album={album} />)
    const link = screen.getByRole('link', { name: /open album/i })
    expect(link).toBeDefined()
    expect(link.href).toContain('?album=TEST01')
    expect(link.target).toBe('_blank')
  })

  it('renders album title', () => {
    render(<AlbumDetailView album={album} />)
    expect(screen.getByText('Sunday Worship')).toBeDefined()
  })
})
