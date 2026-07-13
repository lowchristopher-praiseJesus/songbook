import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeSong = {
  meta: { title: 'Oceans', artist: 'Hillsong' },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: 'la',
}

vi.mock('../../../lib/ugImport/fetchSong', () => ({
  fetchAndParseSong: vi.fn(() => Promise.resolve(fakeSong)),
}))
vi.mock('../../../lib/communityImport/communityClient', () => ({
  reportCommunityArrangement: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))

import { reportCommunityArrangement } from '../../../lib/communityImport/communityClient'
import { UGPreviewModal } from '../UGPreviewModal'

const communityResult = { source: 'community', id: 'a1', url: 'community:a1', title: 'Oceans' }
const ugResult = { source: 'ug', url: 'https://tabs.ultimate-guitar.com/tab/x', title: 'Oceans' }

beforeEach(() => vi.clearAllMocks())

describe('UGPreviewModal — report', () => {
  it('shows a Report link for a community result', async () => {
    render(<UGPreviewModal result={communityResult} apiKey={null} isOpen onClose={() => {}} onImported={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('songbody')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument()
  })

  it('does NOT show a Report link for a UG result', async () => {
    render(<UGPreviewModal result={ugResult} apiKey="KEY" isOpen onClose={() => {}} onImported={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('songbody')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument()
  })

  it('submits the chosen reason', async () => {
    render(<UGPreviewModal result={communityResult} apiKey={null} isOpen onClose={() => {}} onImported={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('songbody')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(screen.getByRole('button', { name: /copyright/i }))

    await waitFor(() => expect(reportCommunityArrangement).toHaveBeenCalledWith('a1', 'copyright'))
    expect(await screen.findByText(/thanks/i)).toBeInTheDocument()
  })
})
