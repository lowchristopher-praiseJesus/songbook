import { parseContent } from './contentParser'

// Chromatic key names (flat-preferred, matching sbpParser.js)
const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

// Keys that use flat accidentals: Db(1), Eb(3), F(5), Ab(8), Bb(10) — matches sbpParser
const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10])

// Note name → chromatic index (handles sharps and flats)
const NOTE_TO_IDX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

// ChordPro start-of-section directive → default section label
const SECTION_DEFAULTS = {
  start_of_verse:      'Verse',
  sov:                 'Verse',
  start_of_chorus:     'Chorus',
  soc:                 'Chorus',
  start_of_bridge:     'Bridge',
  sob:                 'Bridge',
  start_of_pre_chorus: 'Pre-Chorus',
  sopc:                'Pre-Chorus',
  start_of_intro:      'Intro',
  start_of_outro:      'Outro',
  start_of_tag:        'Tag',
}

// Matches: {start_of_chorus} or {start_of_chorus: Custom Label}
const SECTION_START_RE = /^\{(start_of_\w+|soc|sov|sob|sopc)\s*(?::\s*(.*?))?\s*\}/i

// Matches end-of-section directives (all variants)
const SECTION_END_RE = /^\{(end_of_\w+|eoc|eov|eob|eopc)\s*\}/i

// Matches tab/grid skip blocks
const TAB_START_RE  = /^\{(start_of_tab|sot)\s*\}/i
const TAB_END_RE    = /^\{(end_of_tab|eot)\s*\}/i
const GRID_START_RE = /^\{start_of_grid\s*\}/i
const GRID_END_RE   = /^\{end_of_grid\s*\}/i

// Metadata and comment directives: {key: value}
const DIRECTIVE_RE = /^\{(\w+)\s*(?::\s*(.*?))?\s*\}/

/**
 * Parse a ChordPro plain-text string into the app's Song structure.
 *
 * Strategy: convert ChordPro section/content syntax into SBP content format
 * (which uses `{c: Label}` headers and `[Chord]` inline), then delegate to
 * the existing parseContent() for line-level parsing. This reuses all
 * existing chord/lyric rendering and editing logic.
 *
 * @param {string} text      Raw ChordPro file contents
 * @param {string} [filename] Optional filename used as fallback title
 * @returns {{ meta: object, sections: Section[], rawText: string }}
 */
export function parseChordPro(text, filename) {
  const meta = {
    title: null,
    artist: undefined,
    key: 'C',
    keyIndex: 0,
    isMinor: false,
    usesFlats: false,
    capo: 0,
    tempo: undefined,
    timeSignature: undefined,
    copyright: undefined,
    ccli: undefined,
    subTitle: undefined,
  }

  const contentLines = []
  let skipBlock = false

  for (const rawLine of text.split('\n')) {
    // ── Skip blocks (tab, grid) ──────────────────────────────────────────
    if (TAB_START_RE.test(rawLine) || GRID_START_RE.test(rawLine)) {
      skipBlock = true
      continue
    }
    if (TAB_END_RE.test(rawLine) || GRID_END_RE.test(rawLine)) {
      skipBlock = false
      continue
    }
    if (skipBlock) continue

    // ── Comment lines ────────────────────────────────────────────────────
    if (rawLine.trimStart().startsWith('#')) continue

    // ── Section end directives → discard (sections end implicitly) ───────
    if (SECTION_END_RE.test(rawLine)) continue

    // ── Section start directives → convert to SBP {c: Label} ────────────
    const secMatch = rawLine.match(SECTION_START_RE)
    if (secMatch) {
      const directive = secMatch[1].toLowerCase()
      const customLabel = secMatch[2]?.trim()
      const label = customLabel || SECTION_DEFAULTS[directive] || 'Section'
      contentLines.push(`{c: ${label}}`)
      continue
    }

    // ── All other {directive:} lines ─────────────────────────────────────
    const dirMatch = rawLine.match(DIRECTIVE_RE)
    if (dirMatch) {
      const key = dirMatch[1].toLowerCase()
      const value = (dirMatch[2] ?? '').trim()

      switch (key) {
        case 'title':
        case 't':
          meta.title = value
          break

        case 'subtitle':
        case 'st':
        case 'artist':
        case 'a':
          meta.artist = value || undefined
          break

        case 'key': {
          // Handle minor suffix: "Am" → root=A, isMinor=true
          const isMinor = value.length > 1 && value.endsWith('m')
          const rootStr = isMinor ? value.slice(0, -1) : value
          const keyIdx = NOTE_TO_IDX[rootStr] ?? 0
          meta.key = KEY_NAMES[keyIdx]
          meta.keyIndex = keyIdx
          meta.isMinor = isMinor
          meta.usesFlats = FLAT_KEY_INDICES.has(keyIdx)
          break
        }

        case 'capo': {
          const n = parseInt(value, 10)
          if (!isNaN(n)) meta.capo = Math.max(0, Math.min(5, n))
          break
        }

        case 'tempo':
        case 'bpm': {
          const bpm = parseInt(value, 10)
          if (!isNaN(bpm)) meta.tempo = bpm
          break
        }

        case 'time':
          meta.timeSignature = value || undefined
          break

        case 'copyright':
          meta.copyright = value || undefined
          break

        case 'ccli':
          meta.ccli = value || undefined
          break

        // All other directives (comment, c, comment_italic, chorus, …) → skip
      }
      // Never emit directive lines to content
      continue
    }

    // ── Regular lyric/chord line → pass through unchanged ────────────────
    contentLines.push(rawLine)
  }

  // Fallback title
  if (!meta.title) {
    meta.title = filename
      ? filename.replace(/\.(cho|chordpro|chopro|pro)$/i, '')
      : 'Untitled'
  }

  // Strip trailing blank lines so parseContent doesn't append spurious blank lines
  while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
    contentLines.pop()
  }

  const rawText = contentLines.join('\n')
  const sections = parseContent(rawText)

  return { meta, sections, rawText }
}
