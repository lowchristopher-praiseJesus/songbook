import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./firecrawlClient', () => ({ scrapeURL: vi.fn() }))
vi.mock('./ugParser', () => ({ parseUGPage: vi.fn() }))
vi.mock('../danielchoyImport/danielchoyParser', () => ({ parseDanielChoyPage: vi.fn() }))

import { scrapeURL } from './firecrawlClient'
import { parseUGPage } from './ugParser'
import { parseDanielChoyPage } from '../danielchoyImport/danielchoyParser'
import { fetchAndParseSong } from './fetchSong'

const ugResult = { url: 'https://tabs.ultimate-guitar.com/tab/foo-chords-1', source: 'ug' }
const dcResultWithHtml = { url: 'https://danielchoy.example/foo', source: 'danielchoy', rawHtml: '<feed/>' }
const dcResultNoHtml = { url: 'https://danielchoy.example/bar', source: 'danielchoy' }

const ugSong = { meta: { title: 'Foo' }, sections: [{ label: 'Verse', lines: [] }] }
const dcSong = { meta: { title: 'Bar' }, sections: [{ label: 'Chorus', lines: [] }] }

describe('fetchAndParseSong', () => {
  beforeEach(() => {
    scrapeURL.mockReset()
    parseUGPage.mockReset()
    parseDanielChoyPage.mockReset()
  })

  it('scrapes and parses a UG result', async () => {
    const scraped = { rawHtml: '<html></html>', markdown: '' }
    scrapeURL.mockResolvedValue(scraped)
    parseUGPage.mockReturnValue(ugSong)

    const song = await fetchAndParseSong(ugResult, 'KEY')

    expect(scrapeURL).toHaveBeenCalledWith(ugResult.url, 'KEY')
    expect(parseUGPage).toHaveBeenCalledWith(scraped, ugResult.url)
    expect(song).toBe(ugSong)
  })

  it('parses a Daniel Choy result from cached rawHtml without scraping', async () => {
    parseDanielChoyPage.mockReturnValue(dcSong)

    const song = await fetchAndParseSong(dcResultWithHtml, 'KEY')

    expect(scrapeURL).not.toHaveBeenCalled()
    expect(parseDanielChoyPage).toHaveBeenCalledWith('<feed/>', dcResultWithHtml)
    expect(song).toBe(dcSong)
  })

  it('scrapes a Daniel Choy result when rawHtml is missing', async () => {
    scrapeURL.mockResolvedValue({ rawHtml: '<html></html>', markdown: '' })
    parseDanielChoyPage.mockReturnValue(dcSong)

    const song = await fetchAndParseSong(dcResultNoHtml, 'KEY')

    expect(scrapeURL).toHaveBeenCalledWith(dcResultNoHtml.url, 'KEY')
    expect(parseDanielChoyPage).toHaveBeenCalledWith('<html></html>', dcResultNoHtml)
    expect(song).toBe(dcSong)
  })
})