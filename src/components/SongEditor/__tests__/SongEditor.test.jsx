import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongEditor } from '../SongEditor'

const mockSong = {
  id: 'song-1',
  rawText: '{c: Verse}\n[G]Hello world',
  meta: {
    title: 'My Song',
    artist: 'Test Artist',
    key: 'G',
    keyIndex: 7,
    usesFlats: false,
    capo: 0,
    tempo: 120,
    timeSignature: '4/4',
  },
  sections: [],
}

const mockUpdateSong = vi.fn()
const mockSetEditingSongId = vi.fn()

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      activeSong: mockSong,
      updateSong: mockUpdateSong,
      setEditingSongId: mockSetEditingSongId,
    }),
}))

describe('SongEditor', () => {
  beforeEach(() => {
    mockUpdateSong.mockReset()
    mockSetEditingSongId.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pre-populates title field from song meta', () => {
    render(<SongEditor songId="song-1" />)
    expect(screen.getByDisplayValue('My Song')).toBeInTheDocument()
  })

  it('pre-populates textarea with rawText', () => {
    render(<SongEditor songId="song-1" />)
    const textarea = screen.getByLabelText('Song content')
    expect(textarea.value).toBe(mockSong.rawText)
  })

  it('Save calls updateSong with songId and current meta and rawText', () => {
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mockUpdateSong).toHaveBeenCalledWith('song-1', {
      meta: expect.objectContaining({ title: 'My Song', key: 'G' }),
      rawText: mockSong.rawText,
    })
  })

  it('Save calls setEditingSongId(null)', () => {
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mockSetEditingSongId).toHaveBeenCalledWith(null)
  })

  it('Cancel without changes calls setEditingSongId(null) without confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mockSetEditingSongId).toHaveBeenCalledWith(null)
  })

  it('Cancel with changes shows confirm dialog', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SongEditor songId="song-1" />)
    fireEvent.change(screen.getByLabelText('Song content'), {
      target: { value: 'changed content' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(window.confirm).toHaveBeenCalledWith('Discard changes?')
    expect(mockSetEditingSongId).not.toHaveBeenCalled()
  })

  it('Cancel with changes navigates away when confirm returns true', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SongEditor songId="song-1" />)
    fireEvent.change(screen.getByLabelText('Song content'), {
      target: { value: 'changed content' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockSetEditingSongId).toHaveBeenCalledWith(null)
  })
})
