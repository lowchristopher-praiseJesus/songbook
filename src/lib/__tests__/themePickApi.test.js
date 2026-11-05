import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getThemePickQuota, requestThemePicks, withTimeout } from '../themePickApi'

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('requestThemePicks', () => {
  it('POSTs theme, count and exclude with the Turnstile token and returns picks', async () => {
    const payload = { picks: [{ id: 'a', title: 'T', artist: '', section: 'opening', reason: 'r' }], remaining: 4 }
    fetch.mockResolvedValue(res(200, payload))

    const out = await requestThemePicks({ theme: 'Glory', count: 10, exclude: ['x'], turnstileToken: 'tok' })

    expect(out).toEqual(payload)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toMatch(/\/theme-pick$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Turnstile-Token': 'tok' })
    expect(JSON.parse(init.body)).toEqual({ theme: 'Glory', count: 10, exclude: ['x'] })
  })

  it.each([
    [429, { error: 'daily_limit', resetsAt: '2026-11-06T00:00:00.000Z' }, 'daily_limit'],
    [429, { error: 'global_limit', resetsAt: '2026-11-06T00:00:00.000Z' }, 'global_limit'],
    [503, { error: 'picker_unavailable' }, 'picker_unavailable'],
    [502, { error: 'picker_bad_output' }, 'picker_bad_output'],
    [403, { error: 'turnstile_failed' }, 'turnstile_failed'],
    [400, { error: 'invalid_input' }, 'invalid_input'],
    [500, {}, 'network_error'],
  ])('status %i maps to code %s', async (status, body, code) => {
    fetch.mockResolvedValue(res(status, body))
    await expect(requestThemePicks({ theme: 't', count: 1, exclude: [], turnstileToken: 'k' }))
      .rejects.toMatchObject({ code, ...(body.resetsAt ? { resetsAt: body.resetsAt } : {}) })
  })

  it('maps a rejected fetch to network_error', async () => {
    fetch.mockRejectedValue(new TypeError('offline'))
    await expect(requestThemePicks({ theme: 't', count: 1, exclude: [], turnstileToken: 'k' }))
      .rejects.toMatchObject({ code: 'network_error' })
  })
})

describe('getThemePickQuota', () => {
  it('returns the quota', async () => {
    const q = { remaining: 3, limit: 5, resetsAt: '2026-11-06T00:00:00.000Z' }
    fetch.mockResolvedValue(res(200, q))
    expect(await getThemePickQuota()).toEqual(q)
    expect(fetch.mock.calls[0][0]).toMatch(/\/theme-pick\/quota$/)
  })

  it('returns null on failure', async () => {
    fetch.mockRejectedValue(new TypeError('offline'))
    expect(await getThemePickQuota()).toBeNull()
    fetch.mockResolvedValue(res(500, {}))
    expect(await getThemePickQuota()).toBeNull()
  })
})

describe('withTimeout', () => {
  it('rejects with the given code when the promise never settles', async () => {
    vi.useFakeTimers()
    try {
      const p = withTimeout(new Promise(() => {}), 20000, 'turnstile_failed')
      const assertion = expect(p).rejects.toMatchObject({ code: 'turnstile_failed' })
      await vi.advanceTimersByTimeAsync(20000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes the value through when the promise settles in time', async () => {
    expect(await withTimeout(Promise.resolve('tok'), 1000, 'x')).toBe('tok')
  })
})
