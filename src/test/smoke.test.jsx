import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { LiveSessionModal } from '../components/Session/LiveSessionModal'
import { EditLockWarning } from '../components/Session/EditLockWarning'

// Mock sessionApi to avoid network calls
vi.mock('../lib/sessionApi', () => ({
  createSession: vi.fn(),
  fetchSessionState: vi.fn(),
}))

describe('setup', () => {
  it('vitest works', () => expect(1 + 1).toBe(2))
})

describe('Session component smoke tests', () => {
  it('renders LiveSessionModal without crashing', () => {
    render(
      <LiveSessionModal
        isOpen={false}
        onClose={() => {}}
        onStartSession={() => {}}
        onJoinSession={() => {}}
      />
    )
  })

  it('renders LiveSessionModal in open state without crashing', () => {
    render(
      <LiveSessionModal
        isOpen={true}
        onClose={() => {}}
        onStartSession={() => {}}
        onJoinSession={() => {}}
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
