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
vi.mock('../../../lib/ugImport/fetchSong', () => ({ fetchAndParseSong: vi.fn() }))
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))

import { fetchAndParseSong } from '../../../lib/ugImport/fetchSong'
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
    fetchAndParseSong.mockReset()
    fetchAndParseSong.mockResolvedValue(fakeSong)
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
    fireEvent.click(row)
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
    await waitFor(() => expect(mockSelectSong).toHaveBeenCalled())
  })
})

describe('UGSearchModal preview wiring', () => {
  beforeEach(() => {
    storeState.index = []
    fetchAndParseSong.mockReset()
    fetchAndParseSong.mockResolvedValue(fakeSong)
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

  async function searchToResults() {
    renderIt()
    fireEvent.change(screen.getByPlaceholderText(/Song title or artist/i), { target: { value: 'foo' } })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText(/Foo/i)
  }

  it('clicking Preview opens the preview without importing', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')
    expect(mockAddSongs).not.toHaveBeenCalled()
  })

  it('clicking the row body still imports directly', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /^Foo/i }))
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
  })

  it('Preview button does not trigger row import (stopPropagation)', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')
    // import path would have called addSongs; preview must not
    expect(mockAddSongs).not.toHaveBeenCalled()
  })

  it('Import from preview runs runImport', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
  })
})

describe('UGSearchModal duplicate-during-preview-import', () => {
  beforeEach(() => {
    storeState.index = []
    fetchAndParseSong.mockReset()
    fetchAndParseSong.mockResolvedValue(fakeSong)
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
    mockReplaceSong.mockReset()
  })

  async function searchToResults() {
    renderIt()
    fireEvent.change(screen.getByPlaceholderText(/Song title or artist/i), { target: { value: 'foo' } })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText(/Foo/i)
  }

  it('shows duplicate prompt and closes preview when importing a duplicate from preview, then Keep Both adds the song', async () => {
    // Seed the library with a duplicate entry matching fakeSong.meta.title
    storeState.index.push({ id: 'existing-1', title: 'Foo', sourceLabel: 'Ultimate Guitar', sourceKey: 'ug' })

    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')

    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))

    // Preview closes (no songbody) and the duplicate prompt is visible
    await waitFor(() => expect(screen.queryByTestId('songbody')).not.toBeInTheDocument())
    expect(screen.getByText(/already exists/i)).toBeInTheDocument()

    // Choosing "Keep Both" resolves the duplicate and completes the import via addSongs
    fireEvent.click(screen.getByRole('button', { name: /^Keep Both$/i }))
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
    expect(mockReplaceSong).not.toHaveBeenCalled()
  })

  it('choosing Replace from the duplicate prompt replaces the existing song', async () => {
    storeState.index.push({ id: 'existing-1', title: 'Foo', sourceLabel: 'Ultimate Guitar', sourceKey: 'ug' })

    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => expect(screen.queryByTestId('songbody')).not.toBeInTheDocument())
    expect(screen.getByText(/already exists/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Replace$/i }))
    await waitFor(() => expect(mockReplaceSong).toHaveBeenCalledWith('existing-1', fakeSong))
    expect(mockAddSongs).not.toHaveBeenCalled()
  })
})
