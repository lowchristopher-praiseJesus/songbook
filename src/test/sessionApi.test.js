import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSession, fetchSessionState, acquireLock } from '../lib/sessionApi'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

function mockFetch(status, body) {
  fetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('createSession', () => {
  it('returns code and urls on success', async () => {
    mockFetch(200, { code: 'ABC123', leaderToken: 'tok', memberUrl: 'http://x?session=ABC123', leaderUrl: 'http://x?session=ABC123&token=tok', expiresAt: '...' })
    const result = await createSession({ name: 'Test' })
    expect(result.code).toBe('ABC123')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/session/create'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws create_failed on non-ok response', async () => {
    mockFetch(500, {})
    await expect(createSession({})).rejects.toMatchObject({ code: 'create_failed' })
  })
})

describe('fetchSessionState', () => {
  it('returns state on success', async () => {
    mockFetch(200, { version: 3, setList: [] })
    const result = await fetchSessionState('ABC123')
    expect(result.version).toBe(3)
  })

  it('throws expired on 410', async () => {
    mockFetch(410, {})
    await expect(fetchSessionState('ABC123')).rejects.toMatchObject({ code: 'expired' })
  })

  it('throws not_found on 404', async () => {
    mockFetch(404, {})
    await expect(fetchSessionState('ABC123')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('acquireLock', () => {
  it('throws locked with lockedUntil on 423', async () => {
    fetch.mockResolvedValue({
      ok: false, status: 423,
      json: () => Promise.resolve({ lockedUntil: '2026-04-20T10:00:00Z' }),
    })
    await expect(acquireLock('ABC123', 'song-1', 'client-a')).rejects.toMatchObject({
      code: 'locked',
      lockedUntil: '2026-04-20T10:00:00Z',
    })
  })
})
