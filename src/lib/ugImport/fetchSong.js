import { scrapeURL } from './firecrawlClient'
import { parseUGPage } from './ugParser'
import { parseDanielChoyPage } from '../danielchoyImport/danielchoyParser'
import { fetchCommunityArrangement } from '../communityImport/communityClient'
import { parseContent } from '../parser/contentParser'

// Fetch + parse a single search result into a Song object.
// `result` shape: { url, source: 'ug' | 'danielchoy' | 'community', rawHtml?, id? }
// Community results come straight from our own worker as structured JSON — no scrape, and
// no API key. Daniel Choy JSONP results carry rawHtml from the Blogger feed.
// Firecrawl (UG) results have no rawHtml and require a scrape (needs an API key).
export async function fetchAndParseSong(result, apiKey) {
  if (result.source === 'community') {
    const a = await fetchCommunityArrangement(result.id)
    return {
      rawText: a.body,
      meta: {
        title: a.title,
        artist: a.artist,
        keyIndex: a.keyIndex ?? 0,
        capo: a.capo ?? 0,
        tempo: a.tempo ?? undefined,
        // Provenance only. Deliberately no sbpId and no sharedBaseline: mergeSharedCollection
        // skips songs that have neither, which is what makes a community import a snapshot.
        communitySource: {
          arrangementId: a.id,
          publisherName: a.publisherName,
          importedAt: new Date().toISOString(),
        },
      },
      sections: parseContent(a.body),
    }
  }

  if (result.source === 'danielchoy') {
    const rawHtml = result.rawHtml || (await scrapeURL(result.url, apiKey)).rawHtml
    return parseDanielChoyPage(rawHtml, result)
  }

  const scraped = await scrapeURL(result.url, apiKey)
  return parseUGPage(scraped, result.url)
}
