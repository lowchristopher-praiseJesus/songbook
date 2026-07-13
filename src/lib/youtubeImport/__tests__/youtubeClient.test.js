import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../ugImport/firecrawlClient', () => ({
  firecrawlSearch: vi.fn(),
}))

import { firecrawlSearch } from '../../ugImport/firecrawlClient'
import { searchYoutube } from '../youtubeClient'

describe('searchYoutube', () => {
  beforeEach(() => {
    firecrawlSearch.mockReset()
  })

  it('sends a site-restricted query to firecrawlSearch', async () => {
    firecrawlSearch.mockResolvedValue([])
    await searchYoutube('El Shaddai Amy Grant', 'key-123')
    expect(firecrawlSearch).toHaveBeenCalledWith('site:youtube.com/watch El Shaddai Amy Grant', 'key-123')
  })

  it('extracts videoId and strips the trailing " - YouTube" suffix from the title', async () => {
    firecrawlSearch.mockResolvedValue([
      { url: 'https://www.youtube.com/watch?v=abc12345678', title: 'El Shaddai (Live) - YouTube', description: 'd' },
    ])
    const results = await searchYoutube('q', 'key')
    expect(results).toEqual([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
    ])
  })

  it('filters out results that are not /watch?v= URLs', async () => {
    firecrawlSearch.mockResolvedValue([
      { url: 'https://www.youtube.com/channel/UC123', title: 'Some Channel', description: '' },
      { url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz', title: 'Valid Video - YouTube', description: '' },
    ])
    const results = await searchYoutube('q', 'key')
    expect(results).toHaveLength(1)
    expect(results[0].videoId).toBe('zzzzzzzzzzz')
  })

  it('dedupes results with the same videoId, keeping the first occurrence', async () => {
    firecrawlSearch.mockResolvedValue([
      { url: 'https://www.youtube.com/watch?v=dupdupdupdu', title: 'First - YouTube', description: '' },
      { url: 'https://www.youtube.com/watch?v=dupdupdupdu&t=30s', title: 'Second - YouTube', description: '' },
    ])
    const results = await searchYoutube('q', 'key')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('First')
  })

  it('propagates errors thrown by firecrawlSearch', async () => {
    firecrawlSearch.mockRejectedValue(new Error('UNAUTHORIZED'))
    await expect(searchYoutube('q', 'bad-key')).rejects.toThrow('UNAUTHORIZED')
  })
})
