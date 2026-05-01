import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConductorSync } from '../useConductorSync.js'

vi.mock('../../lib/conductorApi.js', () => ({
  fetchConductorStatus: vi.fn(),
  startBroadcast: vi.fn(),
  setCurrentSong: vi.fn(),
  stopBroadcast: vi.fn(),
  joinBroadcast: vi.fn(),
  sendFollowerHeartbeat: vi.fn(),
  leaveBroadcast: vi.fn(),
}))

vi.mock('../../store/libraryStore.js', () => ({
  useLibraryStore: (selector) => selector({
    index: [{ id: 'song-1', title: 'Song One', sbpId: 42 }],
    selectSong: vi.fn(),
  }),
}))

import * as api from '../../lib/conductorApi.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  api.fetchConductorStatus.mockResolvedValue({ live: false, currentSbpId: null, version: 0, followerCount: 0 })
})
afterEach(() => { vi.useRealTimers() })

describe('useConductorSync', () => {
  it('polls fetchConductorStatus every second when conductorCode is set', async () => {
    renderHook(() => useConductorSync({
      conductorCode: 'ABC123',
      directorToken: null,
      activeSongSbpId: null,
      onAddToast: vi.fn(),
    }))
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(api.fetchConductorStatus).toHaveBeenCalledWith('ABC123')
    expect(api.fetchConductorStatus.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('does not poll when conductorCode is null', async () => {
    renderHook(() => useConductorSync({
      conductorCode: null,
      directorToken: null,
      activeSongSbpId: null,
      onAddToast: vi.fn(),
    }))
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(api.fetchConductorStatus).not.toHaveBeenCalled()
  })

  it('exposes live:true when status returns live', async () => {
    api.fetchConductorStatus.mockResolvedValue({ live: true, currentSbpId: null, version: 1, followerCount: 0 })
    const { result } = renderHook(() => useConductorSync({
      conductorCode: 'ABC123', directorToken: null, activeSongSbpId: null, onAddToast: vi.fn(),
    }))
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(result.current.live).toBe(true)
  })
})
