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

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: Object.assign((s) => s(storeState), { getState: () => storeState }),
}))
vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: () => 'KEY' }))

const fakeSong = {
  meta: { title: 'Foo', artist: 'Bar', key: 'G', capo: 0 },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: '',
}

vi.mock('../../../lib/ugImport/firecrawlClient', () => ({
  searchUG: vi.fn(() => Promise.resolve([
    { url: 'https://tabs.ultimate-guitar.com/tab/foo-chords-123', title: 'Foo Chords by Bar', description: 'd' },
  ])),
  scrapeURL: vi.fn(() => Promise.resolve({ rawHtml: '<html></html>', markdown: '' })),
}))
vi.mock('../../../lib/ugImport/ugParser', () => ({ parseUGPage: vi.fn(() => fakeSong) }))
vi.mock('../../../lib/danielchoyImport/danielchoyClient', () => ({ searchDanielChoy: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../../lib/danielchoyImport/danielchoyParser', () => ({ parseDanielChoyPage: vi.fn() }))

import { UGSearchModal } from '../UGSearchModal'

function renderIt() {
  return render(
    <UGSearchModal
      isOpen
      onClose={vi.fn()}
      onSongSelect={vi.fn()}
      onImportSuccess={vi.fn()}
      onAddToast={vi.fn()}
    />,
  )
}

async function searchAndGetRow() {
  renderIt()
  fireEvent.change(screen.getByPlaceholderText(/Song title or artist/i), { target: { value: 'foo' } })
  fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
  return screen.findByText(/Foo/i)
}

describe('UGSearchModal direct import (characterization)', () => {
  beforeEach(() => {
    storeState.index = []
    mockAddSongs.mockReset()
    mockAddSongs.mockImplementation((songs, sourceLabel, sourceKey) => {
      songs.forEach((s, i) => storeState.index.push({
        id: `id-${storeState.index.length}-${i}`,
        title: s.meta.title,
        sourceLabel,
        sourceKey,
      }))
    })
    mockSelectSong.mockReset()
  })

  it('renders results after a search', async () => {
    await searchAndGetRow()
    expect(screen.getByText(/Foo/i)).toBeInTheDocument()
  })

  it('clicking a result imports it directly', async () => {
    const row = await searchAndGetRow()
  // reset call counts captured during render of this test's own render
  mockAddSongs.mockClear()
  mockSelectSong.mockClear()
  fireEvent.click(row)
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
    await waitFor(() => expect(mockSelectSong).toHaveBeenCalled())
  })
})