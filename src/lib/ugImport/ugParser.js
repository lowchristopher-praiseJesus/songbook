import { isChord, parseContent } from '../parser/contentParser'

// Matches [Verse 1], [Chorus], [Bridge], etc. AND ## Verse, ## Chorus etc.
const SECTION_HEADER_RE = /^\[([^\]]+)\]$|^##\s+(.+)$/

function isSectionHeader(line) {
  return SECTION_HEADER_RE.test(line.trim())
}

function toSectionHeader(line) {
  const trimmed = line.trim()
  const m = trimmed.match(SECTION_HEADER_RE)
  if (!m) return null
  const name = (m[1] ?? m[2]).trim()
  return `{c: ${name}}`
}

function isTabHeader(line) {
  return /^\[Tab\]$/i.test(line.trim())
}

// Lines that signal the UG page footer — everything from here is noise
function isFooterLine(trimmed) {
  return /^PrintCreate/i.test(trimmed) ||
    /^Last update:/i.test(trimmed) ||
    /^Please,?\s+rate/i.test(trimmed) ||
    /^Create correction/i.test(trimmed) ||
    /^Report bad tab/i.test(trimmed)
}

// Expand tab characters to 4-space tab stops
function expandTabs(str) {
  let result = ''
  for (const ch of str) {
    if (ch === '\t') {
      result += ' '.repeat(4 - (result.length % 4))
    } else {
      result += ch
    }
  }
  return result
}

// A chord line has ≥2 whitespace-delimited tokens, all passing isChord()
function isChordLine(line) {
  const expanded = expandTabs(line)
  const tokens = expanded.trim().split(/\s+/).filter(Boolean)
  return tokens.length >= 2 && tokens.every(t => isChord(t))
}

// Merge a chord-above-lyrics pair into an inline [Chord] line
function mergeChordAboveLyric(chordLine, lyricLine) {
  const expandedChord = expandTabs(chordLine)
  const expandedLyric = expandTabs(lyricLine)

  const chords = []
  const re = /\S+/g
  let m
  while ((m = re.exec(expandedChord)) !== null) {
    chords.push({ name: m[0], pos: m.index })
  }

  if (chords.length === 0) return expandedLyric.trimEnd()

  // Pad lyric so the rightmost chord position is reachable
  const maxPos = chords[chords.length - 1].pos
  let lyric = expandedLyric.length > maxPos
    ? expandedLyric
    : expandedLyric.padEnd(maxPos + 1)

  // Insert right-to-left using original column positions directly.
  // Right-to-left means each splice only shifts characters to its right,
  // so positions to the left are unaffected — no offset adjustment needed.
  for (let i = chords.length - 1; i >= 0; i--) {
    const { name, pos } = chords[i]
    lyric = lyric.slice(0, pos) + `[${name}]` + lyric.slice(pos)
  }

  return lyric.trimEnd()
}

// Convert a chord line with no following lyric to [G]    [D] format
function toPureChordLine(chordLine) {
  const tokens = expandTabs(chordLine).trim().split(/\s+/).filter(Boolean)
  return tokens.map(t => `[${t}]`).join('    ')
}

// Slug → Title Case, e.g. "blowin-in-the-wind" → "Blowin In The Wind"
function slugToTitle(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Shared content processing pipeline: section headers → chord-above-lyrics → parseContent.
 * Handles both the markdown-from-Firecrawl path and the wiki_tab.content JSON path.
 */
function processContentLines(text) {
  const rawLines = text.split('\n')
  const contentLines = []
  let inTab = false
  let started = false  // don't collect until first section header or chord line

  for (const line of rawLines) {
    const trimmed = line.trim()

    // Footer markers — stop processing
    if (isFooterLine(trimmed)) break

    // [Tab] header → start skipping tablature
    if (isTabHeader(trimmed)) {
      inTab = true
      continue
    }

    // Section header → end tab-skip, mark content started, convert to {c:}
    if (isSectionHeader(trimmed)) {
      inTab = false
      started = true
      const header = toSectionHeader(trimmed)
      if (header) contentLines.push(header)
      continue
    }

    // Start collecting at first chord line even when no section header precedes it
    if (!started) {
      if (!isChordLine(line)) continue
      started = true
    }

    if (inTab) continue

    // Skip H1 and other markdown headings (metadata already extracted)
    if (trimmed.startsWith('# ')) continue
    if (trimmed.match(/^#{1,6}\s/)) continue

    // Skip capo line (already extracted from metadata)
    if (/^capo[:\s]+\d+/i.test(trimmed)) continue

    contentLines.push(line)
  }

  // Chord-above-lyrics → inline [Chord] conversion
  const processedLines = []
  let i = 0
  while (i < contentLines.length) {
    const line = contentLines[i]

    if (line.startsWith('{c:')) {
      processedLines.push(line)
      i++
      continue
    }

    if (isChordLine(line)) {
      const next = contentLines[i + 1]
      const nextIsContent = next !== undefined && !next.startsWith('{c:')

      if (nextIsContent && !isChordLine(next)) {
        processedLines.push(mergeChordAboveLyric(line, next))
        i += 2
      } else {
        processedLines.push(toPureChordLine(line))
        i++
      }
    } else {
      processedLines.push(line)
      i++
    }
  }

  // Strip trailing noise lines (UG end-of-content markers: bare X/x, backticks, empty)
  while (processedLines.length > 0 && /^[xX`\s]*$/.test(processedLines[processedLines.length - 1])) {
    processedLines.pop()
  }

  return processedLines.join('\n')
}

function makeSong(contentString, meta) {
  return { rawText: contentString, meta, sections: parseContent(contentString) }
}

// ---------------------------------------------------------------------------
// JSON extraction from store.page_data
// ---------------------------------------------------------------------------

/**
 * Walk the HTML string to find and parse the store.page_data JSON blob.
 * Returns the parsed object, or null if not found / not parseable.
 */
function extractStorePageData(html) {
  const marker = html.indexOf('store.page_data')
  if (marker === -1) return null

  const eqPos = html.indexOf('=', marker)
  if (eqPos === -1) return null

  const start = html.indexOf('{', eqPos)
  if (start === -1) return null

  // Walk braces, respecting JSON strings, to find the matching close brace
  let depth = 0
  let inString = false
  let escape = false
  let i = start

  while (i < html.length) {
    const ch = html[i]
    if (escape)                    { escape = false; i++; continue }
    if (ch === '\\' && inString)   { escape = true;  i++; continue }
    if (ch === '"')                { inString = !inString; i++; continue }
    if (!inString) {
      if (ch === '{') depth++
      else if (ch === '}' && --depth === 0) break
    }
    i++
  }

  try {
    return JSON.parse(html.slice(start, i + 1))
  } catch {
    return null
  }
}

/**
 * Build a song from the parsed store.page_data object.
 * Returns null if the required wiki_tab.content field is absent.
 */
function parseFromStoreData(data, url) {
  const tab = data.tab ?? {}
  const rawContent = data.tab_view?.wiki_tab?.content ?? ''
  if (!rawContent) return null

  const title = (tab.song_name ?? '').trim()
    || slugToTitle(url.split('/').filter(Boolean).pop() ?? '')
    || 'Unknown'
  const artist = (tab.artist_name ?? '').trim()
  const capo = parseInt(tab.capo ?? 0, 10) || 0

  // Strip UG's [ch]Chord[/ch] notation → bare chord tokens for chord-above-lyrics detection
  // Strip [tab]...[/tab] tablature blocks
  const content = rawContent
    .replace(/\[ch\]/g, '')
    .replace(/\[\/ch\]/g, '')
    .replace(/\[tab\][\s\S]*?\[\/tab\]/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const contentString = processContentLines(content)
  return makeSong(contentString, {
    title, artist, key: 'C', keyIndex: 0, isMinor: false, usesFlats: false, capo,
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Primary entry point. Tries to extract song data from the store.page_data
 * JSON blob in the raw HTML; falls back to markdown parsing if unavailable.
 *
 * @param {{ rawHtml: string, markdown: string }} scraped
 * @param {string} [url]
 */
export function parseUGPage({ rawHtml = '', markdown = '' } = {}, url = '') {
  if (rawHtml) {
    const storeData = extractStorePageData(rawHtml)
    if (storeData) {
      const result = parseFromStoreData(storeData, url)
      if (result) return result
    }
  }
  return parseUGMarkdown(markdown, url)
}

/**
 * Markdown-only parser — kept for fallback and backwards compatibility.
 *
 * @param {string} markdown - Raw markdown from Firecrawl /scrape
 * @param {string} [url]    - UG URL (used for slug fallback)
 */
export function parseUGMarkdown(markdown = '', url = '') {
  const h1Match = markdown.match(/^#\s+(.+?)\s+[Cc]hords\s+by\s+(.+)$/m)
  let title, artist
  if (h1Match) {
    title = h1Match[1].trim()
    artist = h1Match[2].trim()
  } else {
    const slug = url.split('/').filter(Boolean).pop() ?? ''
    title = slugToTitle(slug) || 'Unknown'
    artist = ''
  }

  const capoMatch = markdown.match(/capo[:\s]+(\d+)/i)
  const capo = capoMatch ? parseInt(capoMatch[1], 10) : 0

  const contentString = processContentLines(markdown)
  return makeSong(contentString, {
    title, artist, key: 'C', keyIndex: 0, isMinor: false, usesFlats: false, capo,
  })
}
