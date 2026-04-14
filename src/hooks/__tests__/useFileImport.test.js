import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFileImport } from '../useFileImport'

const mockAddSongs = vi.fn()

vi.mock('../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      addSongs: mockAddSongs,
      replaceSong: vi.fn(),
      index: [],
    }),
}))

vi.mock('../../lib/parser/chordProParser', () => ({
  parseChordPro: () => ({
    meta: { title: 'Test Song', artist: '' },
    rawText: '',
    sections: [],
  }),
}))

vi.mock('../../lib/parser/sbpParser', () => ({
  parseSbpFile: vi.fn(),
}))

describe('useFileImport onSuccess payload', () => {
  let onError, onSuccess, onDuplicateCheck

  beforeEach(() => {
    vi.clearAllMocks()
    onError = vi.fn()
    onSuccess = vi.fn()
    onDuplicateCheck = vi.fn()
    mockAddSongs.mockReturnValue({ newSongIds: ['new-id'], collectionId: null })
  })

  it('passes the addSongs result to onSuccess after importing a .cho file', async () => {
    const { result } = renderHook(() =>
      useFileImport({ onError, onDuplicateCheck, onSuccess })
    )
    const file = new File(['title: Test Song'], 'test.cho', { type: 'text/plain' })
    await result.current.importFiles([file])

    expect(mockAddSongs).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith({ newSongIds: ['new-id'], collectionId: null })
  })

  it('calls onSuccess with empty newSongIds when file type is unsupported', async () => {
    const { result } = renderHook(() =>
      useFileImport({ onError, onDuplicateCheck, onSuccess })
    )
    const file = new File(['data'], 'document.txt', { type: 'text/plain' })
    await result.current.importFiles([file])

    expect(mockAddSongs).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith({ newSongIds: [], collectionId: null })
    expect(onError).toHaveBeenCalled()
  })

  it('accumulates newSongIds across multiple files', async () => {
    // Each file call returns a different result
    mockAddSongs
      .mockReturnValueOnce({ newSongIds: ['id-1'], collectionId: null })
      .mockReturnValueOnce({ newSongIds: ['id-2'], collectionId: null })

    const { result } = renderHook(() =>
      useFileImport({ onError, onDuplicateCheck, onSuccess })
    )
    const file1 = new File(['title: Song One'], 'song1.cho', { type: 'text/plain' })
    const file2 = new File(['title: Song Two'], 'song2.cho', { type: 'text/plain' })
    await result.current.importFiles([file1, file2])

    expect(onSuccess).toHaveBeenCalledWith({
      newSongIds: ['id-1', 'id-2'],
      collectionId: null,
    })
  })
})
