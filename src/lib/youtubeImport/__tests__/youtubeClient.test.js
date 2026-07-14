import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../ugImport/firecrawlClient', () => ({
  firecrawlSearch: vi.fn(),
}))

import { firecrawlSearch } from '../../ugImport/firecrawlClient'
import { searchYoutube, parseYouTubeVideoId } from '../youtubeClient'

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

describe('parseYouTubeVideoId', () => {
  it.each([
    ['standard watch url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['watch url with extra params', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s&list=PL'],
    ['v param not first', 'https://www.youtube.com/watch?list=PL&v=dQw4w9WgXcQ'],
    ['short youtu.be url', 'https://youtu.be/dQw4w9WgXcQ'],
    ['youtu.be with timestamp', 'https://youtu.be/dQw4w9WgXcQ?t=30'],
    ['shorts url', 'https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['embed url', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['live url', 'https://www.youtube.com/live/dQw4w9WgXcQ'],
    ['mobile watch url', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['http scheme', 'http://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['no scheme', 'youtube.com/watch?v=dQw4w9WgXcQ'],
    ['no scheme youtu.be', 'youtu.be/dQw4w9WgXcQ'],
    ['with surrounding whitespace', '  https://www.youtube.com/watch?v=dQw4w9WgXcQ  '],
  ])('extracts the video id from a %s', (_label, input) => {
    expect(parseYouTubeVideoId(input)).toBe('dQw4w9WgXcQ')
  })

  it.each([
    ['a plain search phrase', 'El Shaddai Amy Grant'],
    ['a phrase that mentions youtube', 'el shaddai youtube'],
    ['a non-youtube url', 'https://vimeo.com/12345'],
    ['a youtube channel url', 'https://www.youtube.com/channel/UC123'],
    ['a youtube search results url', 'https://www.youtube.com/results?search_query=foo'],
    ['a watch url with no v param', 'https://www.youtube.com/watch?list=PL'],
    ['empty string', ''],
  ])('returns null for %s', (_label, input) => {
    expect(parseYouTubeVideoId(input)).toBeNull()
  })
})
