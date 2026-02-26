const SECTION_RE = /^\{c:\s*(.+?)\s*\}$/

/**
 * Parse SongBook Pro inline-chord content string into structured sections.
 *
 * Format:
 *   {c: Section Name}   — starts a new section
 *   [Chord]             — inline chord token within a lyric line
 *   Pure chord lines    — lines containing only [Chord] tokens and whitespace
 */
export function parseContent(content) {
  if (!content) return []

  const lines = content.split('\n')
  const sections = []
  let current = null

  for (const rawLine of lines) {
    const sectionMatch = rawLine.match(SECTION_RE)

    if (sectionMatch) {
      current = { label: sectionMatch[1], lines: [] }
      sections.push(current)
      continue
    }

    // Content before first section marker gets a default unnamed section
    if (!current) {
      current = { label: '', lines: [] }
      sections.push(current)
    }

    if (rawLine.trim() === '') {
      current.lines.push({ type: 'blank', content: '', chords: [] })
      continue
    }

    current.lines.push(parseLine(rawLine))
  }

  return sections
}

/**
 * Parse a single content line, extracting inline [Chord] tokens.
 * Returns a SongLine with type, content (lyric text), and chords array.
 */
function parseLine(rawLine) {
  const chords = []
  let lyric = ''
  let i = 0

  while (i < rawLine.length) {
    if (rawLine[i] === '[') {
      const close = rawLine.indexOf(']', i + 1)
      if (close === -1) {
        // No closing bracket — treat as literal character
        lyric += rawLine[i++]
        continue
      }
      const candidate = rawLine.slice(i + 1, close)
      if (isChord(candidate)) {
        chords.push({ chord: candidate, position: lyric.length })
        i = close + 1
      } else {
        // Not a chord — copy literally including the brackets
        lyric += rawLine[i++]
      }
    } else {
      lyric += rawLine[i++]
    }
  }

  // A pure chord line has only whitespace left in the lyric text
  const isPureChordLine = lyric.trim() === '' && chords.length > 0

  return {
    type: isPureChordLine ? 'chord' : 'lyric',
    content: isPureChordLine ? '' : lyric,
    chords,
  }
}

// Matches: G, Am, F#m, Bb, Cmaj7, G/B, A/C#, Fmaj7, E7, etc.
const CHORD_RE = /^[A-G][b#]?(?:maj|min|m|M|aug|dim|sus[24]?|add)?[0-9]?(?:\/[A-G][b#]?)?$/

function isChord(str) {
  return CHORD_RE.test(str.trim())
}
