import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/storage', () => ({
  saveSong: vi.fn(),
  loadSong: vi.fn(() => null),
  deleteSong: vi.fn(),
  loadIndex: vi.fn(() => []),
  saveIndex: vi.fn(),
  getLastSongId: vi.fn(() => null),
  setLastSongId: vi.fn(),
  clearLastSongId: vi.fn(),
  loadCollections: vi.fn(() => []),
  saveCollections: vi.fn(),
  getViewMode: vi.fn(() => 'collections'),
  saveViewMode: vi.fn(),
  getTransposeState: vi.fn(() => null),
  setTransposeState: vi.fn(),
  getFirecrawlKey: vi.fn(() => null),
}))
vi.mock('../../../lib/communityImport/communityClient', () => ({
  searchCommunity: vi.fn(),
  recordCommunityImport: vi.fn(),
}))
vi.mock('../../../lib/ugImport/firecrawlClient', () => ({ searchUG: vi.fn() }))
vi.mock('../../../lib/danielchoyImport/danielchoyClient', () => ({ searchDanielChoy: vi.fn() }))
vi.mock('../../../lib/ugImport/fetchSong', () => ({ fetchAndParseSong: vi.fn() }))
vi.mock('../../UGImport/UGPreviewModal', () => ({ UGPreviewModal: () => null }))

import { AddSongsModal } from '../AddSongsModal'
import { useLibraryStore } from '../../../store/libraryStore'
import { getFirecrawlKey } from '../../../lib/storage'
import { searchCommunity, recordCommunityImport } from '../../../lib/communityImport/communityClient'
import { searchUG } from '../../../lib/ugImport/firecrawlClient'
import { searchDanielChoy } from '../../../lib/danielchoyImport/danielchoyClient'
import { fetchAndParseSong } from '../../../lib/ugImport/fetchSong'

const onClose = vi.fn()

function setup() {
  useLibraryStore.setState({
    index: [
      { id: 's1', title: 'Amazing Grace', artist: 'Traditional' },
      { id: 's2', title: 'Way Maker', artist: 'Sinach' },
      { id: 's3', title: 'Oceans', artist: 'Hillsong' },
    ],
    collections: [
      { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] },
    ],
  })
  render(<AddSongsModal isOpen collectionId="c1" collectionName="Sunday Set" onClose={onClose} onAddToast={vi.fn()} />)
}

const setIds = () => useLibraryStore.getState().collections.find(c => c.id === 'c1').songIds

async function searchOnline(query) {
  fireEvent.change(screen.getByRole('textbox', { name: /search/i }), { target: { value: query } })
  fireEvent.click(screen.getByRole('button', { name: 'Search online' }))
  await screen.findByRole('heading', { name: /community/i })
}

beforeEach(() => {
  vi.clearAllMocks()
  getFirecrawlKey.mockReturnValue(null)
  searchCommunity.mockResolvedValue([])
  searchUG.mockResolvedValue([])
  searchDanielChoy.mockResolvedValue([])
})

describe('AddSongsModal: library', () => {
  it('lists library songs and marks the ones already in the set', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Add Oceans' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Amazing Grace is in the set' })).toBeDisabled()
  })

  it('filters library songs as you type', () => {
    setup()
    fireEvent.change(screen.getByRole('textbox', { name: /search/i }), { target: { value: 'ocean' } })
    expect(screen.getByRole('button', { name: 'Add Oceans' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Way Maker' })).not.toBeInTheDocument()
  })

  it('adds a song to the end of the set and stays open', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add Oceans' }))
    expect(setIds()).toEqual(['s1', 's3'])
    expect(screen.getByRole('button', { name: 'Undo add Oceans' })).toHaveTextContent('Added · #2')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('undoes an add made in this dialog', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add Oceans' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo add Oceans' }))
    expect(setIds()).toEqual(['s1'])
    expect(screen.getByRole('button', { name: 'Add Oceans' })).toBeInTheDocument()
  })

  it('inserts at the chosen position', () => {
    setup()
    fireEvent.change(screen.getByRole('combobox', { name: 'Insert' }), { target: { value: 'start' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Oceans' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Way Maker' }))
    expect(setIds()).toEqual(['s3', 's2', 's1'])
  })

  it('counts the songs added and closes on Done', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add Oceans' }))
    expect(screen.getByText('1 song added')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('AddSongsModal: online', () => {
  it('marks an online result that is already in the library and adds the library copy', async () => {
    searchDanielChoy.mockResolvedValue([{ url: 'https://dc/1', title: 'Way Maker', artist: 'Sinach' }])
    setup()
    await searchOnline('way maker')
    const row = screen.getByRole('button', { name: 'Add Way Maker (your library copy)' }).closest('li')
    expect(within(row).getByText('In your library')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Add Way Maker (your library copy)' }))
    expect(setIds()).toEqual(['s1', 's2'])
    expect(fetchAndParseSong).not.toHaveBeenCalled()
  })

  it('imports a new online song into the library and the set, without closing', async () => {
    searchCommunity.mockResolvedValue([{ id: 'cm1', source: 'community', title: 'Goodness of God', artist: 'Bethel' }])
    fetchAndParseSong.mockResolvedValue({ rawText: '', meta: { title: 'Goodness of God', artist: 'Bethel' }, sections: [] })
    setup()
    await searchOnline('goodness')
    fireEvent.click(screen.getByRole('button', { name: 'Import and add Goodness of God' }))
    // The new song now shows in both the library list and the online results.
    expect(await screen.findAllByRole('button', { name: 'Undo add Goodness of God' })).toHaveLength(2)
    const newId = useLibraryStore.getState().index.find(e => e.title === 'Goodness of God').id
    expect(setIds()).toEqual(['s1', newId])
    expect(recordCommunityImport).toHaveBeenCalledWith('cm1')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an error on the dialog when an import fails', async () => {
    searchCommunity.mockResolvedValue([{ id: 'cm1', source: 'community', title: 'Goodness of God', artist: 'Bethel' }])
    fetchAndParseSong.mockRejectedValue(new Error('network'))
    setup()
    await searchOnline('goodness')
    fireEvent.click(screen.getByRole('button', { name: 'Import and add Goodness of God' }))
    expect(await screen.findByText(/connection failed/i)).toBeInTheDocument()
    expect(setIds()).toEqual(['s1'])
  })

  it('filters sections with the source tabs', async () => {
    searchCommunity.mockResolvedValue([{ id: 'cm1', source: 'community', title: 'Goodness of God', artist: 'Bethel' }])
    setup()
    await searchOnline('o')
    fireEvent.click(screen.getByRole('tab', { name: 'Community' }))
    expect(screen.queryByRole('heading', { name: /in your library/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /community/i })).toBeInTheDocument()
  })

  it('explains that Ultimate Guitar is skipped without a Firecrawl key', async () => {
    setup()
    await searchOnline('way maker')
    expect(screen.getByText(/ultimate guitar needs a firecrawl api key/i)).toBeInTheDocument()
    expect(searchUG).not.toHaveBeenCalled()
  })

  it('searches Ultimate Guitar when a key is set', async () => {
    getFirecrawlKey.mockReturnValue('key')
    searchUG.mockResolvedValue([{ url: 'https://ug/1', title: 'Oceans Chords ver. 2', description: 'Hillsong' }])
    setup()
    await searchOnline('oceans')
    expect(searchUG).toHaveBeenCalledWith('oceans', 'key')
    expect(screen.getByRole('heading', { name: /ultimate guitar/i })).toBeInTheDocument()
  })
})
