import { isChord, parseContent } from '../parser/contentParser'
import { detectKeyFromContent } from '../parser/chordUtils'
import { expandTabs, mergeChordAboveLyric, toPureChordLine, KEY_TO_INDEX, FLAT_KEY_NAMES } from '../ugImport/ugParser'

// Line type constants
const T_SECTION = 'section'
const T_CHORD   = 'chord'
const T_LYRIC   = 'lyric'
const T_META    = 'meta'
const T_BLANK   = 'blank'

const SECTION_RE = /^(verse|chorus|bridge|intro|outro|pre.?chorus|tag|refrain|interlude|coda|hook|vamp|ending|instrumental|turnaround|modulation|key\s+change)\b/i
const META_RE    = /^((original\s+key[^:]*:|key\s+sig[^:]*:|play\s+in[^:]*:|capo\s*:|tempo\s*:|time\s+sig[^:]*:|sequence\s*:|ccli[^:]*:|song\s+no[^:]*:|hp\s+recording[^:]*:|writer[^:]*:|author[^:]*:|arr\.?[^:]*:|arrangement[^:]*:)|(written\s+by|produced?\s+by|co-?produced\s+by|strumming\s+pattern)\s+)/i
const CREDIT_RE  = /@\s+(?:[A-Za-z]+\s+)?\d{4}/
const PLAY_IN_KEY_RE = /play\s+in\s+key\s*:\s*([A-G][b#]?)/i

function stripHTML(html) {
  let s = html.replace(/<\/(div|p|li|tr)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = s.replace(/&amp;/g, '&')
  s = s.replace(/&lt;/g, '<')
  s = s.replace(/&gt;/g, '>')
  s = s.replace(/&quot;/g, '"')
  s = s.replace(/&#39;/g, "'")
  s = s.replace(/&nbsp;|&#160;/g, ' ')
  s = s.replace(/&apos;/g, "'")
  s = s.replace(/&rsquo;|&lsquo;|&#8217;|&#8216;|’|‘/g, "'")
  s = s.replace(/&rdquo;|&ldquo;|&#8220;|&#8221;|“|”/g, '"')
  return s
}

function isChordLine(line) {
  const expanded = expandTabs(line)
  const tokens = expanded.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  const withoutRhythm = tokens.map(t => t.replace(/[-^|/]+$/, ''))
  const chordCount = withoutRhythm.filter(t => t && isChord(t)).length
  return chordCount > 0 && withoutRhythm.every(t => !t || isChord(t) || /^[|\-^/x]+$/.test(t))
}

function classifyLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return { type: T_BLANK, text: '' }
  if (CREDIT_RE.test(trimmed)) return { type: T_META, text: trimmed }

  // Strip bold markers to detect section names
  const plain = trimmed.replace(/^\*\*|^\*|^__|^_/, '').replace(/\*\*$|\*$|__$|_$/, '').trim()
  if ((trimmed.startsWith('**') || trimmed.startsWith('__')) && SECTION_RE.test(plain) && plain.split(/\s+/).length <= 4) {
    return { type: T_SECTION, text: plain }
  }
  if (SECTION_RE.test(trimmed) && trimmed.split(/\s+/).length <= 4) {
    return { type: T_SECTION, text: trimmed }
  }
  if (META_RE.test(trimmed)) return { type: T_META, text: trimmed }
  if (isChordLine(trimmed)) return { type: T_CHORD, text: trimmed }
  return { type: T_LYRIC, text: trimmed }
}

function parseMeta(metaState, line) {
  const lower = line.toLowerCase()
  const colonIdx = line.indexOf(':')
  const value = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : ''

  if (/^original\s+key|^key\s+sig/i.test(lower)) {
    if (!metaState.key) {
      const m = PLAY_IN_KEY_RE.exec(line)
      if (m) {
        metaState.key = m[1]
        // Extract capo from remainder after the "Play in Key: X" match
        if (!metaState.capo) {
          const after = line.slice(m.index + m[0].length)
          const capoM = /capo\s+(\d+)/i.exec(after)
          if (capoM) metaState.capo = capoM[1]
        }
      } else {
        const v = value.replace(/\(.*?\)/, '').trim().split(/\s+/)[0] ?? ''
        if (v) metaState.key = v
      }
    }
  } else if (/^play\s+in/i.test(lower)) {
    if (!metaState.key) {
      const v = value.replace(/\(.*?\)/, '').trim().split(/\s+/)[0] ?? ''
      if (v) metaState.key = v
    }
  } else if (/^capo/i.test(lower)) {
    metaState.capo = value.split(/\s+/)[0] ?? ''
  }
}

function resolveKey(keyStr) {
  if (!keyStr) return null
  const isMinor = keyStr.endsWith('m') && keyStr.length > 1
  const root = isMinor ? keyStr.slice(0, -1) : keyStr
  const keyIndex = KEY_TO_INDEX[root]
  if (keyIndex === undefined) return null
  return { key: root, keyIndex, isMinor, usesFlats: FLAT_KEY_NAMES.has(root) }
}

/**
 * Parse a BloggerEntry from the Daniel Choy feed into a song object.
 * @param {{ title: { $t: string }, content: { $t: string } }} entry
 * @param {{ title: string, artist: string }} titleMeta - pre-parsed title/artist from client
 */
export function parseDanielChoyEntry(entry, titleMeta) {
  const html = entry?.content?.$t ?? ''
  const text = stripHTML(html)
  const rawLines = text.split('\n')

  const metaState = { key: '', capo: '' }
  const classified = []
  const seenSections = {}
  let contentStarted = false
  let stopped = false

  for (const rawLine of rawLines) {
    if (stopped) break
    const line = rawLine.replace(/\r$/, '')

    // "Intro: | chords |" — colon-split into section + chord line
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const potential = line.slice(0, colonIdx).trim()
      const rest = line.slice(colonIdx + 1).trim()
      if (SECTION_RE.test(potential) && potential.split(/\s+/).length <= 4 && rest) {
        contentStarted = true
        const key = potential.toLowerCase()
        seenSections[key] = (seenSections[key] ?? 0) + 1
        if (seenSections[key] > 1) { stopped = true; break }
        classified.push({ type: T_SECTION, text: potential })
        if (isChordLine(rest)) classified.push({ type: T_CHORD, text: rest })
        continue
      }
    }

    const cl = classifyLine(line)
    if (cl.type === T_META) parseMeta(metaState, cl.text)
    if (cl.type === T_SECTION) {
      contentStarted = true
      const key = cl.text.toLowerCase()
      seenSections[key] = (seenSections[key] ?? 0) + 1
      if (seenSections[key] > 1) { stopped = true; break }
    }
    if (cl.type === T_CHORD) contentStarted = true
    if (!contentStarted && (cl.type === T_LYRIC || cl.type === T_BLANK)) continue
    classified.push(cl)
  }

  // Fallback: if filter removed everything, parse without preamble suppression
  if (classified.length === 0) {
    for (const rawLine of rawLines) {
      classified.push(classifyLine(rawLine.replace(/\r$/, '')))
    }
  }

  // Build content string: section → {c:}, meta → skip, chord/lyric → inline conversion
  const outputLines = []
  let i = 0
  while (i < classified.length) {
    const cl = classified[i]
    if (cl.type === T_BLANK)   { outputLines.push(''); i++; continue }
    if (cl.type === T_META)    { i++; continue }
    if (cl.type === T_SECTION) { outputLines.push(`{c: ${cl.text}}`); i++; continue }

    if (cl.type === T_CHORD) {
      const next = classified[i + 1]
      if (next && next.type === T_LYRIC) {
        outputLines.push(mergeChordAboveLyric(cl.text, next.text))
        i += 2
      } else {
        outputLines.push(toPureChordLine(cl.text))
        i++
      }
      continue
    }

    // Lyric
    outputLines.push(cl.text)
    i++
  }

  // Trim trailing blank lines
  while (outputLines.length > 0 && !outputLines[outputLines.length - 1].trim()) {
    outputLines.pop()
  }

  const contentString = outputLines.join('\n')
  const sections = parseContent(contentString)

  // Resolve key
  let keyInfo = resolveKey(metaState.key)
  if (!keyInfo) keyInfo = detectKeyFromContent(contentString)

  const capo = parseInt(metaState.capo, 10) || 0

  return {
    rawText: contentString,
    meta: {
      title: titleMeta.title,
      artist: titleMeta.artist,
      key: keyInfo.key,
      keyIndex: keyInfo.keyIndex,
      isMinor: keyInfo.isMinor,
      usesFlats: keyInfo.usesFlats,
      capo,
    },
    sections,
  }
}
