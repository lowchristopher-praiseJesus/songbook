import { scrapeURL } from './firecrawlClient'
import { parseUGPage } from './ugParser'
import { parseDanielChoyPage } from '../danielchoyImport/danielchoyParser'

// Fetch + parse a single search result into a Song object.
// `result` shape: { url, source: 'ug' | 'danielchoy', rawHtml? }
// Daniel Choy JSONP results carry rawHtml from the Blogger feed — no scrape needed.
// Firecrawl (UG) results have no rawHtml and require a scrape (needs an API key).
export async function fetchAndParseSong(result, apiKey) {
  if (result.source === 'danielchoy') {
    const rawHtml = result.rawHtml || (await scrapeURL(result.url, apiKey)).rawHtml
    return parseDanielChoyPage(rawHtml, result)
  }
  const scraped = await scrapeURL(result.url, apiKey)
  return parseUGPage(scraped, result.url)
}
