import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createConductorSession, fetchConductorStatus,
  startBroadcast, setCurrentSong, stopBroadcast,
  joinBroadcast, sendFollowerHeartbeat, leaveBroadcast,
} from '../conductorApi.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
}
function mockStatus(status, body) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  mockFetch.mockReset()
  import.meta.env.VITE_WORKER_URL = 'https://worker.test'
})

describe('fetchConductorStatus', () => {
  it('calls GET /conductor/:code/status and returns data', async () => {
    mockFetch.mockReturnValue(mockOk({ live: true, currentSbpId: 42, version: 3, followerCount: 2 }))
    const result = await fetchConductorStatus('ABC123')
    expect(mockFetch).toHaveBeenCalledWith('https://worker.test/conductor/ABC123/status')
    expect(result.live).toBe(true)
    expect(result.currentSbpId).toBe(42)
  })

  it('throws with code not_found on 404', async () => {
    mockFetch.mockReturnValue(mockStatus(404, {}))
    await expect(fetchConductorStatus('XXXXXX')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('joinBroadcast', () => {
  it('throws with code full on 403', async () => {
    mockFetch.mockReturnValue(mockStatus(403, { error: 'full' }))
    await expect(joinBroadcast('ABC123', 'client-a')).rejects.toMatchObject({ code: 'full' })
  })
})
