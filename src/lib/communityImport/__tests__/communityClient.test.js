import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchCommunity, fetchCommunityArrangement, recordCommunityImport,
  reportCommunityArrangement, publishCollection, unpublishCollection,
  searchCommunityCollections, fetchCommunityCollection,
} from '../communityClient'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(body, ok = true, status = 200) {
  global.fetch = vi.fn(() => Promise.resolve({
    ok, status, json: () => Promise.resolve(body),
  }))
}

describe('searchCommunity', () => {
  it('tags results with source and a synthetic url key', async () => {
    mockFetch({ results: [{
      id: 'a1', title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 2, tempo: 70,
      collectionName: 'Judah', publisherName: 'Chris', importCount: 5,
    }] })

    const results = await searchCommunity('oceans')
    expect(results).toEqual([{
      id: 'a1',
      url: 'community:a1',
      source: 'community',
      title: 'Oceans',
      artist: 'Hillsong',
      description: 'Key D · capo 2 · from "Judah" · 5 imports',
      keyIndex: 2, capo: 2, tempo: 70,
      collectionName: 'Judah', publisherName: 'Chris', importCount: 5,
    }])
    const callUrl = global.fetch.mock.calls[0][0]
    expect(callUrl).toContain('/community/search')
    expect(callUrl).toContain('q=oceans')
  })

  it('returns [] for a blank query without hitting the network', async () => {
    global.fetch = vi.fn()
    expect(await searchCommunity('   ')).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws on a network failure so the caller can report the source as failed', async () => {
    mockFetch({}, false, 500)
    await expect(searchCommunity('oceans')).rejects.toMatchObject({ code: 'network_error' })
  })
})

describe('fetchCommunityArrangement', () => {
  it('returns the arrangement', async () => {
    mockFetch({ id: 'a1', title: 'Oceans', artist: 'Hillsong', body: 'la', keyIndex: 2, capo: 2 })
    const a = await fetchCommunityArrangement('a1')
    expect(a).toMatchObject({ id: 'a1', title: 'Oceans', body: 'la' })
    const callUrl = global.fetch.mock.calls[0][0]
    expect(callUrl).toContain('/community/arrangement/a1')
  })

  it('throws not_found on 404', async () => {
    mockFetch({ error: 'not_found' }, false, 404)
    await expect(fetchCommunityArrangement('nope')).rejects.toMatchObject({ code: 'not_found' })
    const callUrl = global.fetch.mock.calls[0][0]
    expect(callUrl).toContain('/community/arrangement/nope')
  })
})

describe('recordCommunityImport', () => {
  it('never throws, even when the network fails — a counter must not break an import', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')))
    await expect(recordCommunityImport('a1')).resolves.toBeUndefined()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/import'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('reportCommunityArrangement', () => {
  it('posts the reason', async () => {
    mockFetch({ ok: true }, true, 201)
    await reportCommunityArrangement('a1', 'copyright')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/community/arrangement/a1/report'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'copyright' }) }),
    )
  })
})

describe('publishCollection', () => {
  it('sends the turnstile token and returns the publish token', async () => {
    mockFetch({ publicationId: 'p1', publishToken: 't1', published: 3, alreadyInPool: 1 }, true, 201)
    const songs = [{ title: 'T', artist: 'A', body: 'la' }]
    const out = await publishCollection({
      collectionName: 'Judah', publisherName: 'Chris',
      songs,
      turnstileToken: 'ts',
    })
    expect(out).toEqual({ publicationId: 'p1', publishToken: 't1', published: 3, alreadyInPool: 1 })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/community/publish'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Turnstile-Token': 'ts' }),
        body: JSON.stringify({ collectionName: 'Judah', publisherName: 'Chris', songs }),
      }),
    )
  })

  it('throws rate_limited on 429', async () => {
    mockFetch({ error: 'rate_limited' }, false, 429)
    await expect(publishCollection({ collectionName: 'C', songs: [], turnstileToken: 't' }))
      .rejects.toMatchObject({ code: 'rate_limited' })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/community/publish'),
      expect.anything(),
    )
  })
})

describe('unpublishCollection', () => {
  it('sends a DELETE request with the publish token', async () => {
    mockFetch({}, true, 200)
    await unpublishCollection('p1', 'token123')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/community/publication/p1'),
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'X-Publish-Token': 'token123' }),
      }),
    )
  })

  it('throws invalid_token on 403', async () => {
    mockFetch({ error: 'invalid_token' }, false, 403)
    await expect(unpublishCollection('p1', 'bad')).rejects.toMatchObject({ code: 'invalid_token' })
  })
})

describe('searchCommunityCollections', () => {
  it('returns collection results', async () => {
    mockFetch({ results: [{
      id: 'p1', collectionName: 'Judah Worship Set', publisherName: 'First Baptist',
      songCount: 2, createdAt: 1234567890,
    }] })

    const results = await searchCommunityCollections('judah')
    expect(results).toEqual([{
      id: 'p1', collectionName: 'Judah Worship Set', publisherName: 'First Baptist',
      songCount: 2, createdAt: 1234567890,
    }])
    const callUrl = global.fetch.mock.calls[0][0]
    expect(callUrl).toContain('/community/collections/search')
    expect(callUrl).toContain('q=judah')
  })

  it('returns [] for a blank query without hitting the network', async () => {
    global.fetch = vi.fn()
    expect(await searchCommunityCollections('   ')).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws on a network failure', async () => {
    mockFetch({}, false, 500)
    await expect(searchCommunityCollections('judah')).rejects.toMatchObject({ code: 'network_error' })
  })
})

describe('fetchCommunityCollection', () => {
  it('returns the collection with its songs', async () => {
    mockFetch({
      id: 'p1', collectionName: 'Judah Worship Set', publisherName: 'First Baptist',
      songs: [{ id: 's1', title: 'Oceans', artist: 'Hillsong', body: 'la', keyIndex: 2, capo: 0 }],
    })
    const collection = await fetchCommunityCollection('p1')
    expect(collection).toMatchObject({ id: 'p1', collectionName: 'Judah Worship Set' })
    expect(collection.songs).toHaveLength(1)
    const callUrl = global.fetch.mock.calls[0][0]
    expect(callUrl).toContain('/community/collections/p1')
  })

  it('throws not_found on 404', async () => {
    mockFetch({ error: 'not_found' }, false, 404)
    await expect(fetchCommunityCollection('nope')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws network_error on a 500', async () => {
    mockFetch({}, false, 500)
    await expect(fetchCommunityCollection('p1')).rejects.toMatchObject({ code: 'network_error' })
  })
})
