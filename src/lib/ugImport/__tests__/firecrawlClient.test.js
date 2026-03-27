import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchUG, scrapeURL } from '../firecrawlClient'

// Mock global fetch
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

function mockFetch(status, body) {
  global.fetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('searchUG', () => {
  it('returns filtered chord-chart results', async () => {
    mockFetch(200, {
      data: [
        { url: 'https://ultimate-guitar.com/guitar-chords/eagles/hotel-california', title: 'Hotel California Chords by Eagles', description: 'Chords' },
        { url: 'https://ultimate-guitar.com/tabs/eagles/hotel-california-tab', title: 'Tab', description: 'tab' },
        { url: 'https://ultimate-guitar.com/chords/bob-dylan/blowing-in-the-wind', title: 'Blowin Chords', description: '' },
      ]
    })
    const results = await searchUG('hotel california', 'test-key')
    expect(results).toHaveLength(2)
    expect(results[0].url).toContain('guitar-chords')
    expect(results[1].url).toContain('/chords/')
  })

  it('accepts modern UG tab URL format (.../tab/{artist}/{song}-chords-{id})', async () => {
    mockFetch(200, {
      data: [
        { url: 'https://tabs.ultimate-guitar.com/tab/eagles/hotel-california-chords-65946', title: 'Hotel California Chords by Eagles', description: '' },
        { url: 'https://tabs.ultimate-guitar.com/tab/eagles/hotel-california-bass-12345', title: 'Hotel California Bass by Eagles', description: '' },
      ]
    })
    const results = await searchUG('hotel california', 'test-key')
    expect(results).toHaveLength(1)
    expect(results[0].url).toContain('-chords-')
  })

  it('sends correct query and auth header', async () => {
    mockFetch(200, { data: [] })
    await searchUG('amazing grace', 'my-api-key')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/search')
    expect(opts.headers['Authorization']).toBe('Bearer my-api-key')
    const body = JSON.parse(opts.body)
    expect(body.query).toContain('amazing grace')
    expect(body.query).toContain('site:ultimate-guitar.com')
  })

  it('throws UNAUTHORIZED on 401', async () => {
    mockFetch(401, {})
    await expect(searchUG('song', 'bad-key')).rejects.toThrow('UNAUTHORIZED')
  })

  it('throws NETWORK_ERROR on 500', async () => {
    mockFetch(500, {})
    await expect(searchUG('song', 'key')).rejects.toThrow('NETWORK_ERROR')
  })
})

describe('scrapeURL', () => {
  it('returns rawHtml and markdown from nested data shape', async () => {
    mockFetch(200, { data: { rawHtml: '<html/>', markdown: '# Song Chords by Artist' } })
    const result = await scrapeURL('https://ultimate-guitar.com/tab/eagles/foo-chords-123', 'key')
    expect(result.rawHtml).toBe('<html/>')
    expect(result.markdown).toContain('# Song Chords by Artist')
  })

  it('returns rawHtml and markdown from top-level shape', async () => {
    mockFetch(200, { rawHtml: '<html/>', markdown: '# Song Chords by Artist' })
    const result = await scrapeURL('https://ultimate-guitar.com/tab/eagles/foo-chords-123', 'key')
    expect(result.rawHtml).toBe('<html/>')
    expect(result.markdown).toContain('# Song Chords by Artist')
  })

  it('sends rawHtml and markdown formats in request', async () => {
    mockFetch(200, { data: { rawHtml: '', markdown: '' } })
    await scrapeURL('https://ultimate-guitar.com/tab/eagles/foo-chords-123', 'my-key')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/scrape')
    expect(opts.headers['Authorization']).toBe('Bearer my-key')
    const body = JSON.parse(opts.body)
    expect(body.url).toBe('https://ultimate-guitar.com/tab/eagles/foo-chords-123')
    expect(body.formats).toContain('rawHtml')
    expect(body.formats).toContain('markdown')
  })

  it('throws UNAUTHORIZED on 401', async () => {
    mockFetch(401, {})
    await expect(scrapeURL('https://ug.com/foo', 'bad')).rejects.toThrow('UNAUTHORIZED')
  })

  it('throws NETWORK_ERROR on 500', async () => {
    mockFetch(500, {})
    await expect(scrapeURL('https://ug.com/foo', 'key')).rejects.toThrow('NETWORK_ERROR')
  })
})
