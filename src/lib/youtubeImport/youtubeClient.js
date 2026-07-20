import { firecrawlSearch } from '../ugImport/firecrawlClient'

const YT_WATCH_URL_RE = /[?&]v=([\w-]{11})/
const YT_ID_RE = /^[\w-]{11}$/
const YT_TIME_RE = /^(\d+h)?(\d+m)?(\d+s)?$/i

function cleanTitle(title) {
  return (title ?? '').replace(/\s*-\s*YouTube\s*$/i, '').trim()
}

/**
 * Parse `input` as a YouTube URL (watch / youtu.be / shorts / embed / live).
 * Returns the parsed URL, or null if it isn't a YouTube link — meaning the
 * input is a plain search phrase. Accepts urls with or without a scheme, and
 * tolerates surrounding whitespace.
 */
function parseYouTubeUrl(input) {
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
  return isYouTube ? url : null
}

/**
 * If `input` is a YouTube link, return the 11-character video id.
 * Otherwise return null.
 */
export function parseYouTubeVideoId(input) {
  const url = parseYouTubeUrl(input)
  if (!url) return null

  const host = url.hostname.toLowerCase()
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
 * If `input` is a YouTube link carrying a start time (`t=` or `start=`,
 * either plain seconds like `580`/`580s` or YouTube's `1h2m3s` shorthand),
 * return that time in whole seconds. Otherwise return null.
 */
export function parseYouTubeStartSeconds(input) {
  const url = parseYouTubeUrl(input)
  if (!url) return null

  const t = url.searchParams.get('t') ?? url.searchParams.get('start')
  if (!t) return null
  if (/^\d+$/.test(t)) return parseInt(t, 10)

  const match = YT_TIME_RE.exec(t)
  if (!match || !(match[1] || match[2] || match[3])) return null
  const hours = parseInt(match[1] ?? '0', 10)
  const minutes = parseInt(match[2] ?? '0', 10)
  const seconds = parseInt(match[3] ?? '0', 10)
  return hours * 3600 + minutes * 60 + seconds
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
