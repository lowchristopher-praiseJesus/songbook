import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReplaceSong = vi.fn()
const mockSelectSong = vi.fn()
const storeState = { index: [], replaceSong: mockReplaceSong, selectSong: mockSelectSong }
const mockAddSongs = vi.fn((songs, sourceLabel, sourceKey) => {
  songs.forEach((s, i) => storeState.index.push({
    id: `id-${storeState.index.length}-${i}`,
    title: s.meta.title,
    sourceLabel,
    sourceKey,
  }))
})
storeState.addSongs = mockAddSongs
const mockAddSongToCollection = vi.fn()
storeState.addSongToCollection = mockAddSongToCollection

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: Object.assign((s) => s(storeState), { getState: () => storeState }),
}))

// No Firecrawl key: this is the zero-config path, and Community must still work.
vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: () => '' }))

const communitySong = {
  meta: {
    title: 'Oceans',
    artist: 'Hillsong',
    communitySource: { arrangementId: 'a1', publisherName: 'Chris', importedAt: 'now' },
  },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: 'la',
}

vi.mock('../../../lib/ugImport/firecrawlClient', () => ({
  searchUG: vi.fn(() => Promise.resolve([])),
  scrapeURL: vi.fn(),
}))
vi.mock('../../../lib/ugImport/ugParser', () => ({ parseUGPage: vi.fn() }))
vi.mock('../../../lib/danielchoyImport/danielchoyClient', () => ({
  searchDanielChoy: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../../../lib/danielchoyImport/danielchoyParser', () => ({ parseDanielChoyPage: vi.fn() }))
vi.mock('../../../lib/ugImport/fetchSong', () => ({
  fetchAndParseSong: vi.fn(() => Promise.resolve(communitySong)),
}))
vi.mock('../../../lib/communityImport/communityClient', () => ({
  searchCommunity: vi.fn(() => Promise.resolve([{
    id: 'a1',
    url: 'community:a1',
    source: 'community',
    title: 'Oceans',
    artist: 'Hillsong',
    description: 'Key D · capo 2 · from "Judah" · 5 imports',
  }])),
  recordCommunityImport: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))

import { searchCommunity, recordCommunityImport } from '../../../lib/communityImport/communityClient'
import { searchDanielChoy } from '../../../lib/danielchoyImport/danielchoyClient'
import { UGSearchModal } from '../UGSearchModal'

const noop = () => {}

function renderModal(props = {}) {
  return render(
    <UGSearchModal
      isOpen
      onClose={noop}
      onSongSelect={noop}
      onAddToast={noop}
      {...props}
    />,
  )
}

async function search(term = 'oceans') {
  fireEvent.change(screen.getByPlaceholderText(/song title or artist/i), { target: { value: term } })
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }))
}

beforeEach(() => {
  storeState.index.length = 0
  vi.clearAllMocks()
})

describe('UGSearchModal — community source', () => {
  it('shows community results with a CM badge even with no Firecrawl key', async () => {
    renderModal()
    await search()

    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())
    expect(screen.getByText('CM')).toBeInTheDocument()
    expect(screen.getByText(/from "Judah"/)).toBeInTheDocument()
    expect(searchCommunity).toHaveBeenCalledWith('oceans')
  })

  it('still shows community results when Daniel Choy fails', async () => {
    searchDanielChoy.mockRejectedValueOnce(new Error('offline'))
    renderModal()
    await search()

    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())
  })

  it('still shows Daniel Choy results when community fails', async () => {
    searchCommunity.mockRejectedValueOnce(new Error('offline'))
    searchDanielChoy.mockResolvedValueOnce([
      { url: 'https://danielchoy.blogspot.com/2020/01/x.html', title: 'DC Song', artist: 'A' },
    ])
    renderModal()
    await search()

    await waitFor(() => expect(screen.getByText('DC Song')).toBeInTheDocument())
  })

  it('buckets a community import into the Community collection', async () => {
    renderModal()
    await search()
    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Oceans'))

    await waitFor(() => expect(mockAddSongs).toHaveBeenCalled())
    expect(mockAddSongs).toHaveBeenCalledWith([communitySong], 'Community', 'community')
  })

  it('bumps the import counter after a successful import', async () => {
    renderModal()
    await search()
    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Oceans'))

    await waitFor(() => expect(recordCommunityImport).toHaveBeenCalledWith('a1'))
  })

  it('adds the import to the collection it was launched from', async () => {
    renderModal({ collectionId: 'col-1' })
    await search()
    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Oceans'))

    await waitFor(() => expect(mockAddSongToCollection).toHaveBeenCalledWith(expect.any(String), 'col-1'))
  })
})
