import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CreateSessionModal } from '../components/Session/CreateSessionModal'
import { EditLockWarning } from '../components/Session/EditLockWarning'

// Mock sessionApi to avoid network calls
vi.mock('../lib/sessionApi', () => ({
  createSession: vi.fn(),
}))

describe('setup', () => {
  it('vitest works', () => expect(1 + 1).toBe(2))
})

describe('Session component smoke tests', () => {
  it('renders CreateSessionModal without crashing', () => {
    render(
      <CreateSessionModal
        isOpen={false}
        selectedSongIds={new Set()}
        onClose={() => {}}
      />
    )
  })

  it('renders CreateSessionModal in open state without crashing', () => {
    render(
      <CreateSessionModal
        isOpen={true}
        selectedSongIds={new Set(['song-1', 'song-2'])}
        onClose={() => {}}
      />
    )
  })

  it('renders EditLockWarning (no conflict) without crashing', () => {
    render(
      <EditLockWarning
        hadConflict={false}
        myRawText=""
        onRelock={() => {}}
        onDiscard={() => {}}
      />
    )
  })

  it('renders EditLockWarning (conflict) without crashing', () => {
    render(
      <EditLockWarning
        hadConflict={true}
        theirRawText="their version of the song"
        myRawText="my version of the song"
        onRelock={() => {}}
        onKeepTheirs={() => {}}
        onDiscard={() => {}}
      />
    )
  })
})
