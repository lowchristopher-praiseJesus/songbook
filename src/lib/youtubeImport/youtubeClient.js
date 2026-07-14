import { firecrawlSearch } from '../ugImport/firecrawlClient'

const YT_WATCH_URL_RE = /[?&]v=([\w-]{11})/
const YT_ID_RE = /^[\w-]{11}$/

function cleanTitle(title) {
  return (title ?? '').replace(/\s*-\s*YouTube\s*$/i, '').trim()
}

/**
 * If `input` is a YouTube link (watch / youtu.be / shorts / embed / live),
 * return the 11-character video id. Otherwise return null — meaning the
 * input is a plain search phrase and should go through searchYoutube.
 * Accepts urls with or without a scheme, and tolerates surrounding whitespace.
 */
export function parseYouTubeVideoId(input) {
  const raw = (input ?? '').trim()
  if (!raw) return null

  // Treat anything with a host/path as a URL; give it a scheme so URL can parse it.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  const isYouTube = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')
  if (!isYouTube) return null

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return YT_ID_RE.test(id ?? '') ? id : null
  }

  // youtube.com: prefer the v= query param (handles /watch in any param order),
  // then fall back to path-based forms (shorts / embed / live).
  const vParam = url.searchParams.get('v')
  if (YT_ID_RE.test(vParam ?? '')) return vParam

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length >= 2 && ['shorts', 'embed', 'live'].includes(segments[0])) {
    const id = segments[1]
    return YT_ID_RE.test(id) ? id : null
  }
  return null
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
