import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SongEditor } from '../SongEditor'

let mockSong = {
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
const mockSaveAsNewSong = vi.fn()
const mockSelectSong = vi.fn()

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      activeSong: mockSong,
      updateSong: mockUpdateSong,
      saveAsNewSong: mockSaveAsNewSong,
      selectSong: mockSelectSong,
      setEditingSongId: mockSetEditingSongId,
    }),
}))

describe('SongEditor', () => {
  beforeEach(() => {
    mockUpdateSong.mockReset()
    mockSetEditingSongId.mockReset()
    mockSaveAsNewSong.mockReset()
    mockSelectSong.mockReset()
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mockUpdateSong).toHaveBeenCalledWith('song-1', {
      meta: expect.objectContaining({ title: 'My Song', key: 'G' }),
      rawText: mockSong.rawText,
    })
  })

  it('Save calls setEditingSongId(null)', () => {
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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

  it('Save As calls saveAsNewSong with songId and current meta and rawText', () => {
    mockSaveAsNewSong.mockReturnValue('new-song-id')
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save As' }))
    expect(mockSaveAsNewSong).toHaveBeenCalledWith('song-1', {
      meta: expect.objectContaining({ title: 'My Song', key: 'G' }),
      rawText: mockSong.rawText,
    })
  })

  it('Save As selects the new song and closes the editor', () => {
    mockSaveAsNewSong.mockReturnValue('new-song-id')
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save As' }))
    expect(mockSelectSong).toHaveBeenCalledWith('new-song-id')
    expect(mockSetEditingSongId).toHaveBeenCalledWith(null)
  })

  it('Save As does not call updateSong on the original', () => {
    mockSaveAsNewSong.mockReturnValue('new-song-id')
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save As' }))
    expect(mockUpdateSong).not.toHaveBeenCalled()
  })
})

describe('SongEditor — Check key', () => {
  beforeEach(() => {
    mockUpdateSong.mockReset()
    mockSetEditingSongId.mockReset()
    mockSaveAsNewSong.mockReset()
    mockSelectSong.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toasts when there are no chords to analyze', () => {
    const onAddToast = vi.fn()
    render(<SongEditor songId="song-1" onAddToast={onAddToast} />)
    fireEvent.change(screen.getByLabelText('Song content'), {
      target: { value: 'no chords here at all' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }))
    expect(onAddToast).toHaveBeenCalledWith('No chords found to analyze.', 'info')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('toasts success when the stated key matches with no outliers', () => {
    const onAddToast = vi.fn()
    render(<SongEditor songId="song-1" onAddToast={onAddToast} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }))
    expect(onAddToast).toHaveBeenCalledWith('Key looks correct — no issues found.', 'success')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the KeyCheckModal on a key mismatch', () => {
    render(<SongEditor songId="song-1" />)
    fireEvent.change(screen.getByLabelText('Song content'), {
      target: { value: '[B]one [E]two [F#]three [G#m]four\n[B]one [E]two [F#]three [G#m]four' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }))
    expect(screen.getByRole('button', { name: /update key/i })).toBeInTheDocument()
  })

  it('opens the KeyCheckModal (not a toast) when the key matches but outlier chords exist', () => {
    const onAddToast = vi.fn()
    render(<SongEditor songId="song-1" onAddToast={onAddToast} />)
    fireEvent.change(screen.getByLabelText('Song content'), {
      target: { value: '[G]a [C]b [D]c [Em]d [G]a [C]b [D]c [Em]d [G]a [F]b' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }))

    expect(onAddToast).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/✓ Key matches/i)).toBeInTheDocument()
    expect(within(dialog).getByText('F')).toBeInTheDocument()
  })

  it('Update key relabels the key without asking to transpose, leaving chords untouched', () => {
    // The detected key comes from the chords, so they already fit it —
    // transposing here would move them out of the key the user just confirmed.
    const chords = '[B]one [E]two [F#]three [G#m]four\n[B]one [E]two [F#]three [G#m]four'
    render(<SongEditor songId="song-1" />)
    fireEvent.change(screen.getByLabelText('Song content'), { target: { value: chords } })
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }))
    fireEvent.click(screen.getByRole('button', { name: /update key/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/changing the key from/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Key')).toHaveValue('B')
    expect(screen.getByLabelText('Song content').value).toBe(chords)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(mockUpdateSong).toHaveBeenCalledWith('song-1', expect.objectContaining({
      meta: expect.objectContaining({ key: 'B' }),
      rawText: chords,
    }))
  })

  it('changing the key via the Key field still offers to transpose', () => {
    render(<SongEditor songId="song-1" />)
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'A' } })
    expect(screen.getByText(/changing the key from/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transpose Chords' })).toBeInTheDocument()
  })

  describe('when meta.key has drifted from meta.keyIndex', () => {
    let original
    beforeEach(() => {
      original = mockSong
      // Header shows keyIndex (G); a stale key name ('C') must not leak into the editor.
      mockSong = { ...original, meta: { ...original.meta, key: 'C', keyIndex: 7 } }
    })
    afterEach(() => { mockSong = original })

    it('shows the key from keyIndex, matching the song header', () => {
      render(<SongEditor songId="song-1" />)
      expect(screen.getByLabelText('Key')).toHaveValue('G')
    })

    it('saves the keyIndex-derived key name so Save does not shift the key', () => {
      render(<SongEditor songId="song-1" />)
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
      expect(mockUpdateSong).toHaveBeenCalledWith('song-1', expect.objectContaining({
        meta: expect.objectContaining({ key: 'G', keyIndex: 7 }),
      }))
    })
  })
})

