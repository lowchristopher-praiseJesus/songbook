import { firecrawlSearch } from '../ugImport/firecrawlClient'

const DC_URL_RE = /danielchoy\.blogspot\.com\/\d{4}\/\d{2}\/[^?#]+\.html/i

// Matches the key-chord boundary in post titles: ". G Chord" or ". Ab Chord"
const KEY_CHORD_BOUNDARY_RE = /\.\s+[A-G][b#]?(?:[-/][A-G][b#]?)?\s+[Cc]hord/

/**
 * Extract song name and artist from a DC post title like:
 * "Light Of The World – Hillsong. G Chord. (Lyrics and Chords) | Daniel Choy"
 */
export function parseDCTitle(rawTitle) {
  // Strip "Daniel Choy: " prefix — Blogger puts blog name before post title in <title>
  let title = rawTitle.replace(/^Daniel Choy\s*:\s*/i, '').trim()
  // Strip site suffix "| Daniel Choy" or "- Daniel Choy"
  title = title.replace(/\s*[|–-]\s*Daniel Choy\s*$/i, '').trim()

  let songName = title
  let artist = ''

  const emIdx = title.indexOf(' – ')
  const hypIdx = title.indexOf(' - ')
  const sepIdx = emIdx >= 0 ? emIdx : hypIdx
  const sepLen = 3

  if (sepIdx >= 0) {
    songName = title.slice(0, sepIdx).trim()
    let rest = title.slice(sepIdx + sepLen)

    const atIdx = rest.indexOf(' @ ')
    if (atIdx >= 0) {
      artist = rest.slice(0, atIdx).trim()
    } else {
      const m = KEY_CHORD_BOUNDARY_RE.exec(rest)
      if (m) {
        artist = rest.slice(0, m.index).trim()
      } else {
        artist = rest.trim()
      }
    }

    const atIdx2 = artist.indexOf(' @ ')
    if (atIdx2 >= 0) artist = artist.slice(0, atIdx2).trim()
    const parenIdx = artist.indexOf(' (')
    if (parenIdx >= 0) artist = artist.slice(0, parenIdx).trim()
  }

  songName = songName.replace(/\s*\(Lyrics and Chords\)\s*$/i, '').trim()

  return { songName, artist }
}

/**
 * Fetch Daniel Choy blog feed via JSONP (bypasses CORS, no API key needed).
 * The Blogger API returns up to `maxResults` posts matching the query, newest first.
 */
function bloggerJSONP(query, maxResults = 20) {
  return new Promise((resolve, reject) => {
    const cbName = `_dc_cb_${Date.now()}`
    const qs = new URLSearchParams({
      q: query,
      'alt': 'json-in-script',
      'max-results': String(maxResults),
      callback: cbName,
    })
    const url = `https://danielchoy.blogspot.com/feeds/posts/default?${qs}`

    let script
    function cleanup() {
      delete window[cbName]
      if (script && script.parentNode) script.parentNode.removeChild(script)
    }

    const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')) }, 10000)

    window[cbName] = (data) => {
      clearTimeout(timer)
      cleanup()
      resolve(data)
    }

    script = document.createElement('script')
    script.src = url
    script.onerror = () => {
      clearTimeout(timer)
      cleanup()
      reject(new Error('JSONP failed'))
    }
    document.head.appendChild(script)
  })
}

/**
 * All query words longer than 2 chars must appear in the title (case-insensitive).
 * This filters out Blogger API results that mention query words only in song lyrics.
 */
function titleMatchesQuery(title, query) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const t = title.toLowerCase()
  return words.length > 0 && words.every(w => t.includes(w))
}

/**
 * Fall back to Blogger JSONP when Firecrawl finds nothing.
 * Fetches up to 20 posts matching the query, then filters by title.
 */
async function searchDCviaBlogger(query) {
  const data = await bloggerJSONP(query, 20)
  const entries = data?.feed?.entry ?? []
  return entries
    .filter(entry => {
      const rawTitle = entry?.title?.['$t'] ?? ''
      const url = entry?.link?.find(l => l.rel === 'alternate')?.href ?? ''
      return DC_URL_RE.test(url) && titleMatchesQuery(rawTitle, query)
    })
    .map(entry => {
      const rawTitle = entry?.title?.['$t'] ?? ''
      const url = entry?.link?.find(l => l.rel === 'alternate')?.href ?? ''
      const { songName, artist } = parseDCTitle(rawTitle)
      return { title: songName, artist, url }
    })
}

/**
 * Search Daniel Choy's blog for lyrics+chords posts.
 * Phase 1: Firecrawl (Google-backed, fast) — requires API key.
 * Phase 2: Blogger JSONP fallback — no key needed, fetches 20 results with title filtering.
 * Returns [{ title, artist, url, description? }].
 */
export async function searchDanielChoy(query, apiKey) {
  if (apiKey) {
    const data = await firecrawlSearch(
      `site:danielchoy.blogspot.com "${query}"`,
      apiKey,
      10,
    )
    const filtered = data.filter(item => DC_URL_RE.test(item.url))
    if (filtered.length > 0) {
      return filtered.map(item => {
        const { songName, artist } = parseDCTitle(item.title ?? '')
        return { title: songName, artist, url: item.url, description: item.description }
      })
    }
  }

  // Firecrawl found nothing (or no key) — fall back to Blogger JSONP
  return searchDCviaBlogger(query)
}
