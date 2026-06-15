import { firecrawlSearch } from '../ugImport/firecrawlClient'

const DC_URL_RE = /danielchoy\.blogspot\.com\/\d{4}\/\d{2}\/[^?#]+\.html/i

// Matches the key-chord boundary in post titles: ". G Chord" or ". Ab Chord"
const KEY_CHORD_BOUNDARY_RE = /\.\s+[A-G][b#]?(?:[-/][A-G][b#]?)?\s+[Cc]hord/

/**
 * Extract song name and artist from a DC post title like:
 * "Light Of The World – Hillsong. G Chord. (Lyrics and Chords) | Daniel Choy"
 */
export function parseDCTitle(rawTitle) {
  // Strip site suffix "| Daniel Choy" or "- Daniel Choy"
  let title = rawTitle.replace(/\s*[|–-]\s*Daniel Choy\s*$/i, '').trim()

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
 * Search Daniel Choy's blog using Firecrawl (Google-backed search).
 * Returns [{ title, artist, url, description }] — only lyrics+chords posts.
 */
export async function searchDanielChoy(query, apiKey) {
  const data = await firecrawlSearch(
    `site:danielchoy.blogspot.com ${query} "(Lyrics and Chords)"`,
    apiKey,
  )
  return data
    .filter(item => DC_URL_RE.test(item.url))
    .map(item => {
      const { songName, artist } = parseDCTitle(item.title ?? '')
      return { title: songName, artist, url: item.url, description: item.description }
    })
}
