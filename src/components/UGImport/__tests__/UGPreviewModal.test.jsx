import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeSong = {
  meta: { title: 'Foo', artist: 'Bar', key: 'G', capo: 2 },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: '',
}
const emptySong = { meta: { title: 'X' }, sections: [], rawText: '' }

vi.mock('../../../lib/ugImport/fetchSong', () => ({ fetchAndParseSong: vi.fn() }))
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))

import { fetchAndParseSong } from '../../../lib/ugImport/fetchSong'
import { UGPreviewModal } from '../UGPreviewModal'

const result = { url: 'https://tabs.ultimate-guitar.com/tab/foo-chords-1', source: 'ug' }
const defaultProps = { result, apiKey: 'KEY', isOpen: true, onClose: vi.fn(), onImported: vi.fn() }

describe('UGPreviewModal', () => {
  beforeEach(() => {
    fetchAndParseSong.mockReset()
    defaultProps.onClose.mockReset()
    defaultProps.onImported.mockReset()
  })

  it('loads then renders the song body and enables Import', async () => {
    fetchAndParseSong.mockResolvedValue(fakeSong)
    render(<UGPreviewModal {...defaultProps} />)
    expect(screen.getByText(/Loading preview/i)).toBeInTheDocument()
    await screen.findByTestId('songbody')
    expect(screen.getAllByRole('heading', { name: 'Foo' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Bar/i)).toBeInTheDocument()
    expect(screen.getByText(/Key: G/i)).toBeInTheDocument()
    expect(screen.getByText(/Capo: 2/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Import$/i })).toBeEnabled()
  })

  it('shows an error and Close (no Import) when sections are empty', async () => {
    fetchAndParseSong.mockResolvedValue(emptySong)
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByText(/Couldn't extract chords/i)
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument()
  })

  it('shows an error when fetch fails', async () => {
    fetchAndParseSong.mockRejectedValue(new Error('boom'))
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByText(/Connection failed/i)
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument()
  })

  it('Cancel calls onClose', async () => {
    fetchAndParseSong.mockResolvedValue(fakeSong)
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByTestId('songbody')
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('Import calls onImported with the parsed song and result', async () => {
    fetchAndParseSong.mockResolvedValue(fakeSong)
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByTestId('songbody')
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))
    await waitFor(() => expect(defaultProps.onImported).toHaveBeenCalledWith(fakeSong, result))
  })

  it('Import is not available while loading', () => {
    fetchAndParseSong.mockReturnValue(new Promise(() => {})) // never resolves
    render(<UGPreviewModal {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument()
  })
})
