import { parseContent } from '../parser/contentParser'
import { detectKeyFromContent, transposeRawText } from '../parser/chordUtils'
import { KEY_TO_INDEX, FLAT_KEY_NAMES } from '../ugImport/ugParser'
import { expandTabs, isChordLine, mergeChordAboveLyric, toPureChordLine } from '../parser/chordLineUtils'

// Line type constants
const T_SECTION = 'section'
const T_CHORD   = 'chord'
const T_LYRIC   = 'lyric'
const T_META    = 'meta'
const T_BLANK   = 'blank'

const SECTION_RE = /^(verse|chorus|bridge|intro|outro|pre.?chorus|tag|refrain|interlude|coda|hook|vamp|ending|instrumental|turnaround|modulation|key\s+change)\b/i
const META_RE    = /^((original\s+key[^:]*:|key\s+sig[^:]*:|play\s+in[^:]*:|capo\s*:|tempo\s*:|time\s+sig[^:]*:|sequence\s*:|ccli[^:]*:|song\s+no[^:]*:|hp\s+recording[^:]*:|writer[^:]*:|author[^:]*:|arr\.?[^:]*:|arrangement[^:]*:)|(written\s+by|produced?\s+by|co-?produced\s+by|strumming\s+pattern)\s+)/i
const CREDIT_RE  = /@\s+(?:[A-Za-z]+\s+)?\d{4}/
// Matches "Play in G key", "Play in Key: G", "Play in Eb" etc.
// The optional (?:key[\s:]*) handles "key:" or "key " before the note name.
const PLAY_IN_KEY_RE = /play\s+in\s+(?:key[\s:]*)?([A-G][b#]?)\b/i

function stripHTML(html) {
  // Remove <style> and <script> block content (not just the tags)
  let s = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<\/(div|p|li|tr)>/gi, '\n')
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

// Repeat annotations like (2x), x2, x3, (3x) found in chord lines
const REPEAT_ANNOTATION_RE = /^\(?\d+x\)?$|^\(?x\d+\)?$/i

// Returns true when every token in the line is a rhythm marker or repeat annotation.
// Catches lines like "- - | (2x)" that PURE_RHYTHM_RE would miss because of the parens.
function isPureRhythmLine(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every(t => /^[-|^x/]+$/.test(t) || REPEAT_ANNOTATION_RE.test(t))
}

// Replace rhythm-only tokens (-, |, ^, x) with spaces to preserve chord column positions.
// Also strips repeat annotations like (2x) so they don't become [(2x)] in output.
const RHYTHM_ONLY_RE = /^[-|^x/]+$/
function stripRhythmTokens(line) {
  return expandTabs(line).replace(/\S+/g, token =>
    RHYTHM_ONLY_RE.test(token) || REPEAT_ANNOTATION_RE.test(token)
      ? ' '.repeat(token.length)
      : token
  )
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
 * Pre-pass over raw lines to fix Blogger HTML div-split of section names:
 * "Verse" on one line + "1" on the next -> "Verse 1" as one line.
 * This must run before classification so seenSections keys include the number,
 * otherwise "Verse 2" causes a false duplicate-stop after "Verse 1".
 */
function patchSectionLines(rawLines) {
  const out = []
  let i = 0
  while (i < rawLines.length) {
    const line = rawLines[i]
    const trimmed = line.trim()
    const plain = trimmed.replace(/^(\*\*?|__?)/, '').replace(/(\*\*?|__?)$/, '').trim()
    if (SECTION_RE.test(plain) && plain.split(/\s+/).length <= 3) {
      const nextTrimmed = rawLines[i + 1]?.trim()
      if (nextTrimmed && /^\d+$/.test(nextTrimmed)) {
        out.push(trimmed + ' ' + nextTrimmed)
        i += 2
        continue
      }
    }
    out.push(line)
    i++
  }
  return out
}

/**
 * Parse a scraped Daniel Choy blog post page into a song object.
 * @param {string} rawHtml - full page HTML from Firecrawl /scrape
 * @param {{ title: string, artist: string }} titleMeta - pre-parsed from Firecrawl search result
 */
export function parseDanielChoyPage(rawHtml, titleMeta) {
  const html = rawHtml ?? ''
  const text = stripHTML(html)
  // Fix "Verse" + "1" HTML-split before classification so seenSections keys are correct
  const rawLines = patchSectionLines(text.split('\n'))

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

    // Skip standalone rhythm artifacts (|, -, bare bar lines, "- - | (2x)" etc.) misclassified as lyrics
    if (cl.type === T_LYRIC && isPureRhythmLine(cl.text)) { i++; continue }

    if (cl.type === T_CHORD) {
      // Accumulate consecutive chord lines — Blogger HTML often puts each chord in its
      // own <div>, producing fragmented single-chord lines that belong together.
      const chordParts = [cl.text]
      let j = i + 1
      while (j < classified.length && classified[j].type === T_CHORD) {
        chordParts.push(classified[j].text)
        j++
      }

      // Skip past pure-rhythm lyric artifacts between chord block and real lyrics
      while (j < classified.length && classified[j].type === T_LYRIC && isPureRhythmLine(classified[j].text)) {
        j++
      }

      const isFragmented = chordParts.length > 1
      const cleanChord = stripRhythmTokens(chordParts.join('  '))
      const hasChords = /\S/.test(cleanChord)

      const next = classified[j]
      if (next && next.type === T_LYRIC && hasChords) {
        if (!isFragmented) {
          // Single chord line with preserved column positions — inline merge
          outputLines.push(mergeChordAboveLyric(cleanChord, next.text))
        } else {
          // Fragmented: column positions lost from div-per-chord HTML — keep separate
          outputLines.push(toPureChordLine(cleanChord))
          outputLines.push(next.text)
        }
        i = j + 1
      } else if (hasChords) {
        outputLines.push(toPureChordLine(cleanChord))
        i = j
      } else {
        i = j // rhythm-only, skip
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

  let contentString = outputLines.join('\n')

  // Resolve key. Daniel Choy's blog JavaScript transposes chords on the fly, so the raw
  // HTML may store chords in a different key than what the "Play in X key" header says.
  // When the declared play-in key differs from the detected content key, transpose the
  // chord content so the stored song matches what the header promises.
  let keyInfo = resolveKey(metaState.key)
  if (keyInfo) {
    const contentKeyInfo = detectKeyFromContent(contentString)
    if (contentKeyInfo.keyIndex !== keyInfo.keyIndex) {
      let delta = ((keyInfo.keyIndex - contentKeyInfo.keyIndex) % 12 + 12) % 12
      if (delta > 6) delta -= 12
      contentString = transposeRawText(contentString, delta, keyInfo.usesFlats)
    }
  } else {
    keyInfo = detectKeyFromContent(contentString)
  }

  const sections = parseContent(contentString)

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
      capoAppliesAtDisplay: false,
    },
    sections,
  }
}
