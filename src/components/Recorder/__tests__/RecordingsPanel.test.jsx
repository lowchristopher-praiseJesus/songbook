import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RecordingsPanel } from '../RecordingsPanel'

vi.mock('../../../lib/opfsClient', () => ({
  OPFSClient: {
    create: vi.fn(() => ({
      send: vi.fn(async (type) => {
        if (type === 'list-recordings') return [
          { recordingId: 'rec-1', name: 'First Take', date: '2026-04-20T10:00:00.000Z', duration: 65000, size: 512000, mimeType: 'audio/webm' },
        ]
        if (type === 'storage-quota') return { usedBytes: 1024 * 1024, totalBytes: 10 * 1024 * 1024 }
        if (type === 'read-audio') return new ArrayBuffer(512000)
        return { ok: true }
      }),
      terminate: vi.fn(),
    })),
  },
}))

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake')
  global.URL.revokeObjectURL = vi.fn()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

const baseProps = { isOpen: true, songId: 'song-abc', onClose: vi.fn() }

describe('RecordingsPanel', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<RecordingsPanel {...baseProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows dialog when isOpen is true', async () => {
    render(<RecordingsPanel {...baseProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lists recordings after loading', async () => {
    render(<RecordingsPanel {...baseProps} />)
    await waitFor(() => expect(screen.getByText('First Take')).toBeInTheDocument())
  })

  it('shows storage quota', async () => {
    render(<RecordingsPanel {...baseProps} />)
    await waitFor(() => expect(screen.getByText(/storage/i)).toBeInTheDocument())
  })

  it('shows a delete button for each recording', async () => {
    render(<RecordingsPanel {...baseProps} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument())
  })

  it('shows a download button for each recording', async () => {
    render(<RecordingsPanel {...baseProps} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument())
  })

  it('shows empty state when no recordings exist', async () => {
    const { OPFSClient } = await import('../../../lib/opfsClient')
    OPFSClient.create.mockImplementationOnce(() => ({
      send: vi.fn(async (type) => {
        if (type === 'list-recordings') return []
        if (type === 'storage-quota') return { usedBytes: 0, totalBytes: 10 * 1024 * 1024 }
        return { ok: true }
      }),
      terminate: vi.fn(),
    }))
    render(<RecordingsPanel {...baseProps} />)
    await waitFor(() => expect(screen.getByText(/no recordings/i)).toBeInTheDocument())
  })
})
