const BLOGGER_FEED = 'https://danielchoy.blogspot.com/feeds/posts/default'

// Matches the key-chord boundary in post titles: ". G Chord" or ". Ab Chord"
const KEY_CHORD_BOUNDARY_RE = /\.\s+[A-G][b#]?(?:[-/][A-G][b#]?)?\s+[Cc]hord/

/**
 * Extract song name and artist from a post title like:
 * "Song Name – Artist. G Chord. (Lyrics and Chords)"
 */
function parseTitle(title) {
  let songName = title
  let artist = ''

  const emIdx = title.indexOf(' – ')
  const hypIdx = title.indexOf(' - ')
  const sepIdx = emIdx >= 0 ? emIdx : hypIdx
  const sepLen = emIdx >= 0 ? 3 : 3

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

    // Strip trailing " @ Year" or "(..." from artist
    const atIdx2 = artist.indexOf(' @ ')
    if (atIdx2 >= 0) artist = artist.slice(0, atIdx2).trim()
    const parenIdx = artist.indexOf(' (')
    if (parenIdx >= 0) artist = artist.slice(0, parenIdx).trim()
  }

  // Remove "(Lyrics and Chords)" suffix from songName if present
  songName = songName.replace(/\s*\(Lyrics and Chords\)\s*$/i, '').trim()

  return { songName, artist }
}

function entryURL(entry) {
  for (const link of entry.link ?? []) {
    if (link.rel === 'alternate') return link.href
  }
  return ''
}

// Blogger's alt=json endpoint has no CORS headers — use JSONP (alt=json-in-script) instead.
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = `_dcBlogger_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')

    const cleanup = () => {
      delete window[cbName]
      script.remove()
      clearTimeout(timer)
    }

    const timer = setTimeout(() => { cleanup(); reject(new Error('TIMEOUT')) }, 10000)
    window[cbName] = (data) => { cleanup(); resolve(data) }
    script.onerror = () => { cleanup(); reject(new Error('NETWORK_ERROR')) }
    script.src = `${url}&callback=${cbName}`
    document.head.appendChild(script)
  })
}

/**
 * Search Daniel Choy's blog for songs matching query.
 * Returns [{ title, artist, url, entry }] — only lyrics+chords posts.
 */
export async function searchDanielChoy(query) {
  const params = new URLSearchParams({ q: query, alt: 'json-in-script', 'max-results': '8' })
  const data = await jsonp(`${BLOGGER_FEED}?${params}`)
  const entries = data?.feed?.entry ?? []

  return entries
    .filter(e => /\(lyrics and chords\)/i.test(e.title?.$t ?? ''))
    .map(e => {
      const { songName, artist } = parseTitle(e.title.$t)
      return { title: songName, artist, url: entryURL(e), entry: e }
    })
}
