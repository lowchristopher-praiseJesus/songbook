import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConductorJoinModal } from '../components/Conductor/ConductorJoinModal'
import { useLibraryStore } from '../store/libraryStore'

vi.mock('../lib/conductorApi', () => ({
  fetchConductorStatus: vi.fn(),
}))

import { fetchConductorStatus } from '../lib/conductorApi'

const baseSongs = {
  songs: [{ meta: { title: 'El Shaddai' }, id: '1' }],
  collectionName: 'Easter Set',
  conductorCode: 'ABC123',
  lyricsOnly: false,
}

beforeEach(() => {
  fetchConductorStatus.mockResolvedValue({ live: false, currentSbpId: null, followerCount: 0, expiresAt: new Date(Date.now() + 86400000).toISOString() })
  useLibraryStore.setState({ collections: [] })
})

describe('ConductorJoinModal — conductor path', () => {
  it('shows conductor-specific heading when conductorToken is provided', () => {
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken="tok-123" broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    expect(screen.getByText(/conductor link/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import.*conductor/i })).toBeInTheDocument()
  })

  it('calls onImport with "conductor" role when confirmed', () => {
    const onImport = vi.fn()
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken="tok-123" broadcastTime={null}
        onImport={onImport} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /import.*conductor/i }))
    expect(onImport).toHaveBeenCalledWith('conductor')
  })
})

describe('ConductorJoinModal — follower path', () => {
  it('shows follower import button when no conductor token', async () => {
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument())
  })

  it('shows "Live now" badge when server returns live:true', async () => {
    fetchConductorStatus.mockResolvedValue({ live: true, currentSbpId: 5, followerCount: 3, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText(/live now/i)).toBeInTheDocument())
  })

  it('calls onImport with "follower" role', async () => {
    const onImport = vi.fn()
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={onImport} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    await waitFor(() => screen.getByRole('button', { name: /import/i }))
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    expect(onImport).toHaveBeenCalledWith('follower')
  })
})

describe('ConductorJoinModal — dedupe path', () => {
  it('shows rejoin UI when conductorCode already in library', async () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', conductorCode: 'ABC123', conductorRole: 'follower' }
      ],
    })
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    expect(screen.getByText(/already in your library/i)).toBeInTheDocument()
  })

  it('calls onRejoin when Rejoin is clicked', async () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', conductorCode: 'ABC123', conductorRole: 'follower' }
      ],
    })
    const onRejoin = vi.fn()
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={onRejoin} onCancel={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /rejoin/i }))
    expect(onRejoin).toHaveBeenCalled()
  })
})
