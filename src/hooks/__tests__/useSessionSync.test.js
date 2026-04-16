import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionSync } from '../useSessionSync'
import * as sessionApi from '../../lib/sessionApi'

vi.mock('../../lib/sessionApi')
vi.mock('../../store/sessionStore', () => ({
  useSessionStore: vi.fn(sel => sel({
    applyServerState: vi.fn(),
    version: -1,
  })),
}))

beforeEach(() => {
  vi.useFakeTimers()
  sessionApi.fetchSessionState.mockResolvedValue({
    version: 1, name: 'Test', setList: [], songs: {}, editLocks: {}, closed: false,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useSessionSync', () => {
  it('polls on mount', async () => {
    const onEnded = vi.fn()
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded }))
    await act(async () => { await Promise.resolve() })
    expect(sessionApi.fetchSessionState).toHaveBeenCalledWith('ABC123')
  })

  it('polls again after 4 s', async () => {
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded: vi.fn() }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(4000); await Promise.resolve() })
    expect(sessionApi.fetchSessionState).toHaveBeenCalledTimes(2)
  })

  it('calls onEnded when session is closed', async () => {
    sessionApi.fetchSessionState.mockResolvedValue({
      version: 2, name: 'T', setList: [], songs: {}, editLocks: {},
      closed: true, expiresAt: new Date(Date.now() + 86400000).toISOString(),
    })
    const onEnded = vi.fn()
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded }))
    await act(async () => { await Promise.resolve() })
    expect(onEnded).toHaveBeenCalled()
  })

  it('calls onEnded on 410 expired error', async () => {
    sessionApi.fetchSessionState.mockRejectedValue(Object.assign(new Error('expired'), { code: 'expired' }))
    const onEnded = vi.fn()
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded }))
    await act(async () => { await Promise.resolve() })
    expect(onEnded).toHaveBeenCalled()
  })
})
