import { firecrawlSearch } from '../ugImport/firecrawlClient'

const YT_WATCH_URL_RE = /[?&]v=([\w-]{11})/

function cleanTitle(title) {
  return (title ?? '').replace(/\s*-\s*YouTube\s*$/i, '').trim()
}

/**
 * Search YouTube for videos matching a query, via Firecrawl's generic web
 * search restricted to youtube.com/watch pages (the same site-restriction
 * trick searchUG uses for site:ultimate-guitar.com).
 * Returns deduped [{ videoId, title, url }], first occurrence wins on dupes.
 */
export async function searchYoutube(query, apiKey) {
  const items = await firecrawlSearch(`site:youtube.com/watch ${query}`, apiKey)
  const seen = new Set()
  const results = []
  for (const item of items) {
    const match = YT_WATCH_URL_RE.exec(item.url ?? '')
    if (!match) continue
    const videoId = match[1]
    if (seen.has(videoId)) continue
    seen.add(videoId)
    results.push({ videoId, title: cleanTitle(item.title), url: item.url })
  }
  return results
}
