import { isChord, parseContent } from '../parser/contentParser'

// Matches [Verse 1], [Chorus], [Bridge], etc. AND ## Verse, ## Chorus etc.
// Also matches [Tab] for skipping
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

  // Collect {chord, pos} from chord line
  const chords = []
  const re = /\S+/g
  let m
  while ((m = re.exec(expandedChord)) !== null) {
    chords.push({ name: m[0], pos: m.index })
  }

  if (chords.length === 0) return expandedLyric.trimEnd()

  // Compute each chord's adjusted lyric insertion position.
  // Each preceding chord token [X] contributes (name.length + 2) chars to the
  // merged line but occupies zero lyric chars, so we subtract the accumulated
  // overhead to find the lyric position where the chord should be inserted.
  let accumulatedOverhead = 0
  const insertions = chords.map(({ name, pos }) => {
    const lyricPos = Math.max(0, pos - accumulatedOverhead)
    accumulatedOverhead += name.length + 2  // [X] = name + 2 brackets
    return { name, lyricPos }
  })

  // Pad lyric so the last chord's lyric position is reachable
  const maxLyricPos = insertions[insertions.length - 1].lyricPos
  let lyric = expandedLyric.length > maxLyricPos
    ? expandedLyric
    : expandedLyric.padEnd(maxLyricPos + 1)

  // Insert [Chord] tokens right-to-left to avoid index shifts during insertion
  for (let i = insertions.length - 1; i >= 0; i--) {
    const { name, lyricPos } = insertions[i]
    lyric = lyric.slice(0, lyricPos) + `[${name}]` + lyric.slice(lyricPos)
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
 * Parse a Firecrawl markdown string from a UG chord chart page.
 * Returns the canonical song shape for libraryStore.addSongs().
 *
 * @param {string} markdown - Raw markdown from Firecrawl /scrape
 * @param {string} [url='']  - UG URL (used for slug fallback)
 */
export function parseUGMarkdown(markdown = '', url = '') {
  // --- Stage 1: Metadata ---
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

  // --- Stage 2: Process lines ---
  const rawLines = markdown.split('\n')
  const contentLines = []  // lines to feed to chord conversion
  let inTab = false
  let started = false  // don't collect until we see the first section header

  for (const line of rawLines) {
    const trimmed = line.trim()

    // Footer markers — everything from here is UG page chrome, stop processing
    if (isFooterLine(trimmed)) break

    // Detect [Tab] header → start skipping
    if (isTabHeader(trimmed)) {
      inTab = true
      continue
    }

    // Any section header ends Tab-skip mode and marks start of song content
    if (isSectionHeader(trimmed)) {
      inTab = false
      started = true
      // [Tab] itself is handled above; other section headers become {c:}
      const header = toSectionHeader(trimmed)
      if (header) contentLines.push(header)
      continue
    }

    // Skip pre-song noise (everything before the first section header)
    if (!started) continue

    if (inTab) continue

    // Skip H1 line (metadata already extracted)
    if (trimmed.startsWith('# ')) continue

    // Skip markdown headings (##, ###) that aren't section headers
    // (already handled by isSectionHeader for ## patterns matching songs)
    if (trimmed.match(/^#{1,6}\s/)) continue

    // Skip capo line (metadata already extracted)
    if (/^capo[:\s]+\d+/i.test(trimmed)) continue

    contentLines.push(line)
  }

  // --- Stage 3: Chord-above-lyrics conversion ---
  const processedLines = []
  let i = 0
  while (i < contentLines.length) {
    const line = contentLines[i]

    // Section headers pass through as-is
    if (line.startsWith('{c:')) {
      processedLines.push(line)
      i++
      continue
    }

    if (isChordLine(line)) {
      const next = contentLines[i + 1]
      const nextIsContent = next !== undefined && !next.startsWith('{c:')

      if (nextIsContent && !isChordLine(next)) {
        // Chord + lyric pair
        processedLines.push(mergeChordAboveLyric(line, next))
        i += 2
      } else {
        // Pure chord line (no lyric follows, or next is also a chord line)
        processedLines.push(toPureChordLine(line))
        i++
      }
    } else {
      processedLines.push(line)
      i++
    }
  }

  const contentString = processedLines.join('\n')
  const sections = parseContent(contentString)

  return {
    rawText: contentString,
    meta: {
      title,
      artist,
      key: 'C',
      keyIndex: 0,
      isMinor: false,
      usesFlats: false,
      capo,
    },
    sections,
  }
}
