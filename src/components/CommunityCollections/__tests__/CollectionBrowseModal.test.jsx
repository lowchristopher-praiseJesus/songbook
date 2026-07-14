import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelectSong = vi.fn()
const storeState = { index: [] }
const mockAddSongs = vi.fn((songs, collectionName, collectionSource) => {
  const ids = songs.map((s, i) => {
    const id = `id-${storeState.index.length}-${i}`
    storeState.index.push({ id, title: s.meta.title })
    return id
  })
  return { newSongIds: ids, collectionId: `col-${collectionSource}` }
})
storeState.addSongs = mockAddSongs
storeState.selectSong = mockSelectSong

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: Object.assign((s) => s(storeState), { getState: () => storeState }),
}))

vi.mock('../../../lib/communityImport/communityClient', () => ({
  listCommunityCollections: vi.fn(),
  fetchCommunityCollection: vi.fn(),
  recordCommunityImport: vi.fn(() => Promise.resolve()),
}))

import {
  listCommunityCollections, fetchCommunityCollection, recordCommunityImport,
} from '../../../lib/communityImport/communityClient'
import { CollectionBrowseModal } from '../CollectionBrowseModal'

const noop = () => {}

function renderModal(props = {}) {
  return render(
    <CollectionBrowseModal
      isOpen
      onClose={noop}
      onSongSelect={noop}
      onImportSuccess={noop}
      onAddToast={noop}
      {...props}
    />,
  )
}

const oneCollectionResult = [{
  id: 'p1', collectionName: 'Judah Worship Set', publisherName: 'First Baptist',
  songCount: 2, createdAt: 1234567890,
}]

const collectionDetail = {
  id: 'p1', collectionName: 'Judah Worship Set', publisherName: 'First Baptist',
  songs: [
    { id: 's1', title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 0, tempo: null, timeSig: null, body: 'la [D]la', importCount: 5 },
    { id: 's2', title: 'Yeshua', artist: 'Jesus Image', keyIndex: 7, capo: 2, tempo: 72, timeSig: null, body: 'You are [G]holy', importCount: 3 },
  ],
}

beforeEach(() => {
  storeState.index.length = 0
  vi.clearAllMocks()
  listCommunityCollections.mockResolvedValue(oneCollectionResult)
  fetchCommunityCollection.mockResolvedValue(collectionDetail)
})

describe('CollectionBrowseModal', () => {
  it('lists collections immediately on open, with no search step', async () => {
    renderModal()
    await waitFor(() => expect(screen.getByText('Judah Worship Set')).toBeInTheDocument())
    expect(screen.getByText(/First Baptist/)).toBeInTheDocument()
    expect(listCommunityCollections).toHaveBeenCalledWith()
    expect(screen.queryByPlaceholderText(/collection or church name/i)).not.toBeInTheDocument()
  })

  it('shows "no collections available yet" when the list is empty', async () => {
    listCommunityCollections.mockResolvedValueOnce([])
    renderModal()
    await waitFor(() => expect(screen.getByText(/no collections available yet/i)).toBeInTheDocument())
  })

  it('shows a connection error and an empty list when the initial load fails', async () => {
    listCommunityCollections.mockRejectedValueOnce(new Error('offline'))
    renderModal()
    await waitFor(() => expect(
      screen.getByText(/connection failed.*check your internet/i),
    ).toBeInTheDocument())
    expect(screen.queryByText(/no collections available yet/i)).not.toBeInTheDocument()
  })

  it('shows a Retry button on initial-load failure and successfully retries', async () => {
    listCommunityCollections.mockRejectedValueOnce(new Error('offline'))
    renderModal()
    await waitFor(() => expect(screen.getByText(/connection failed.*check your internet/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(screen.getByText('Judah Worship Set')).toBeInTheDocument())
  })

  it('shows a preview of every song after picking a collection', async () => {
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))

    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())
    expect(screen.getByText('Yeshua')).toBeInTheDocument()
    expect(fetchCommunityCollection).toHaveBeenCalledWith('p1')
  })

  it('marks a song already in the library as a duplicate in the preview', async () => {
    storeState.index.push({ id: 'existing', title: 'Oceans' })
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))

    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())
    expect(screen.getByText(/already in your library/i)).toBeInTheDocument()
  })

  it('imports every non-duplicate song as one new collection on Import All', async () => {
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))
    await waitFor(() => screen.getByText('Oceans'))

    fireEvent.click(screen.getByRole('button', { name: /import all/i }))

    await waitFor(() => expect(mockAddSongs).toHaveBeenCalled())
    const [songs, collectionName, collectionSource] = mockAddSongs.mock.calls[0]
    expect(songs).toHaveLength(2)
    expect(songs.map(s => s.meta.title).sort()).toEqual(['Oceans', 'Yeshua'])
    expect(collectionName).toBe('Judah Worship Set')
    expect(collectionSource).toBe('community-collection:p1')
  })

  it('selects the newly created collection after import', async () => {
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))
    await waitFor(() => screen.getByText('Oceans'))

    fireEvent.click(screen.getByRole('button', { name: /import all/i }))

    await waitFor(() => expect(mockSelectSong).toHaveBeenCalledWith(
      expect.any(String), 'col-community-collection:p1',
    ))
  })

  it('skips duplicates and reports the count in the success toast', async () => {
    storeState.index.push({ id: 'existing', title: 'Oceans' })
    const onAddToast = vi.fn()
    renderModal({ onAddToast })
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))
    await waitFor(() => screen.getByText('Oceans'))

    fireEvent.click(screen.getByRole('button', { name: /import all/i }))

    await waitFor(() => expect(mockAddSongs).toHaveBeenCalled())
    const [songs] = mockAddSongs.mock.calls[0]
    expect(songs.map(s => s.meta.title)).toEqual(['Yeshua'])
    expect(onAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/imported 1 song.*judah worship set.*1 already in your library/i),
      'success',
    )
  })

  it('bumps the import counter for every imported song', async () => {
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))
    await waitFor(() => screen.getByText('Oceans'))

    fireEvent.click(screen.getByRole('button', { name: /import all/i }))

    await waitFor(() => expect(recordCommunityImport).toHaveBeenCalledWith('s1'))
    expect(recordCommunityImport).toHaveBeenCalledWith('s2')
  })

  it('disables Import All when every song in the collection is already a duplicate', async () => {
    storeState.index.push({ id: 'e1', title: 'Oceans' }, { id: 'e2', title: 'Yeshua' })
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))
    await waitFor(() => screen.getByText(/all 2 songs are already in your library/i))

    expect(screen.getByRole('button', { name: /import all/i })).toBeDisabled()
  })

  it('shows an error when the collection is no longer available', async () => {
    fetchCommunityCollection.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'not_found' }))
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))

    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeInTheDocument())
  })

  it('shows a storage-full error and stays in preview when addSongs throws QuotaExceededError', async () => {
    mockAddSongs.mockImplementationOnce(() => {
      throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    })
    renderModal()
    await waitFor(() => screen.getByText('Judah Worship Set'))
    fireEvent.click(screen.getByText('Judah Worship Set'))
    await waitFor(() => screen.getByText('Oceans'))

    fireEvent.click(screen.getByRole('button', { name: /import all/i }))

    await waitFor(() => expect(
      screen.getByText(/storage full.*delete some songs before importing/i),
    ).toBeInTheDocument())

    expect(screen.getByText('Oceans')).toBeInTheDocument()
    expect(screen.getByText('Yeshua')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import all/i })).toBeEnabled()
  })
})
