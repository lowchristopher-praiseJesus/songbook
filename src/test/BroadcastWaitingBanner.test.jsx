import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BroadcastWaitingBanner } from '../components/Conductor/BroadcastWaitingBanner'

describe('BroadcastWaitingBanner', () => {
  it('shows countdown when broadcastTime is in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    render(
      <BroadcastWaitingBanner
        phase="waiting"
        broadcastTime={future}
        collectionName="Easter Set"
        previewSongTitle={null}
        onForget={() => {}}
      />
    )
    expect(screen.getByText(/easter set/i)).toBeInTheDocument()
    expect(screen.getByText(/waiting for broadcast/i)).toBeInTheDocument()
  })

  it('shows ended state when phase is "ended"', () => {
    render(
      <BroadcastWaitingBanner
        phase="ended"
        broadcastTime={null}
        collectionName="Easter Set"
        previewSongTitle={null}
        onForget={() => {}}
      />
    )
    expect(screen.getByText(/broadcast ended/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /forget/i })).toBeInTheDocument()
  })

  it('calls onForget when Forget broadcast is clicked', () => {
    const onForget = vi.fn()
    render(
      <BroadcastWaitingBanner
        phase="ended"
        broadcastTime={null}
        collectionName="Easter Set"
        previewSongTitle={null}
        onForget={onForget}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /forget/i }))
    expect(onForget).toHaveBeenCalled()
  })

  it('shows preview song title when provided', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    render(
      <BroadcastWaitingBanner
        phase="waiting"
        broadcastTime={future}
        collectionName="Easter Set"
        previewSongTitle="Hosanna"
        onForget={() => {}}
      />
    )
    expect(screen.getByText(/hosanna/i)).toBeInTheDocument()
  })
})
