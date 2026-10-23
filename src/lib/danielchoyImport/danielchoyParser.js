import { parseContent, isChord } from '../parser/contentParser'
import { detectKeyFromContent } from '../parser/chordUtils'
import { KEY_TO_INDEX, FLAT_KEY_NAMES } from '../ugImport/ugParser'
import { expandTabs, isChordLine, toPureChordLine } from '../parser/chordLineUtils'
import { charPositions } from './timesMetrics'
import { chartKeyFromTitle } from './danielchoyClient'

// Line type constants
const T_SECTION = 'section'
const T_CHORD   = 'chord'
const T_LYRIC   = 'lyric'
const T_META    = 'meta'
const T_BLANK   = 'blank'
const T_NOTE    = 'note' // emitted verbatim, never merged with a chord line above it

// A chord further left than this (1/1000 em, ~6 spaces) of a lyric's first word is a
// lead-in bar played before the line starts, not a chord on the first syllable.
const LEAD_IN_GAP = 1500

// 6/8 charts mark the half-bar with "=" ("| D - - = - - | C - - = - -"); read it as
// a beat dash so the line is still recognised as chords.
function isDCChordLine(text) {
  return isChordLine(text.replace(/(^|\s)=+(?=\s|$)/g, '$1-'))
}

const LATIN_LETTER_RE = /[A-Za-z\u00c0-\u024f'\u2019]/

// Blog navigation links that close every post ("… Content Page", "Back to Praise And
// Worship Songs Content Page For More Other Songs With Chords")
const FOOTER_RE = /content\s+page|^download\s+word\s+format/i

// "Or | G - - - | F - - - |" — an alternative chord progression for the section
const ALT_CHORDS_RE = /^or\s+(.*)$/i

// Full blog pages (Firecrawl scrape) wrap the post in this div; feed entries are the
// post body alone. Anything outside it is sidebar/footer chrome.
const PAGE_TITLE_RE = /<title>([^<]*)<\/title>/i
const POST_BODY_RE = /<div[^>]*\bid=['"]post-body-[^'"]*['"][^>]*>/i
const POST_BODY_END_RE = /<div style=['"]clear: both;['"]><\/div>/i

function extractPostBody(html) {
  const m = POST_BODY_RE.exec(html)
  if (!m) return html
  const body = html.slice(m.index + m[0].length)
  const end = POST_BODY_END_RE.exec(body)
  return end ? body.slice(0, end.index) : body
}

// A line's characters with the rendered x position (Times metrics) of each one, so
// chord columns can be matched to lyric syllables even though the post's font is
// proportional and the alignment was done by eye with &nbsp; padding.
function toSource(line) {
  return { chars: [...expandTabs(line)], xs: charPositions(expandTabs(line)) }
}

function sliceSource(src, from) {
  return { chars: src.chars.slice(from), xs: src.xs.slice(from) }
}

function firstInkX(src) {
  const i = src.chars.findIndex(c => /\S/.test(c))
  return i < 0 ? Infinity : src.xs[i]
}

// Chord tokens with their rendered x position. Tokens split on whitespace and bar
// lines; parenthetical annotations like "(Twice)" are skipped.
function chordTokens(src) {
  const { chars, xs } = src
  const out = []
  let i = 0
  while (i < chars.length) {
    if (chars[i] === '(') {
      const close = chars.indexOf(')', i + 1)
      if (close !== -1) { i = close + 1; continue }
    }
    if (/[\s|]/.test(chars[i])) { i++; continue }
    let j = i
    while (j < chars.length && !/[\s|]/.test(chars[j])) j++
    const name = chars.slice(i, j).join('').replace(/^\[(.+)\]$/, '$1').replace(/[-^/]+$/, '')
    if (name && isChord(name)) out.push({ name, x: xs[i] })
    i = j
  }
  return out
}

const tidy = (s) => s.replace(/\s+/g, ' ').trim()

/**
 * Merge a chord line into the lyric line below it by rendered position. Each chord
 * lands on the lyric character nearest its x, moved forward off whitespace and "(".
 * Returns the lines to emit: lead-in bars (chords well before the lyric starts) as
 * a pure chord line, then the lyric with inline [Chord] tags.
 */
function mergeByPosition(chordSrc, lyricSrc) {
  const { chars, xs } = lyricSrc
  const end = xs[chars.length]
  const start = firstInkX(lyricSrc)
  const nearest = (x) => {
    if (x >= end) return chars.length
    let k = 0
    for (let i = 1; i < chars.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[k] - x)) k = i
    return k
  }
  const isLetter = (i) => i >= 0 && i < chars.length && LATIN_LETTER_RE.test(chars[i])

  const chords = chordTokens(chordSrc).map(c => ({ ...c, near: nearest(c.x) }))
  const at = new Map()
  let prevK = -1
  chords.forEach(({ name, x, near }, ci) => {
    let k = near
    // Off whitespace and "(" onto the next word. Off punctuation too ("said|, no",
    // "glo|-ry") — unless that runs into the next chord's syllable, in which case the
    // author meant the punctuation ("A [E]- [A]men").
    const nextNear = chords[ci + 1]?.near ?? Infinity
    let j = k
    while (j < chars.length && /[\s(),.;:!?\-\u2013\u2014]/.test(chars[j])) j++
    if (/[\s(]/.test(chars[k] ?? '') || j < nextNear) k = j
    // The &nbsp; alignment is by eye, so a chord meant for a syllable often lands a
    // letter into it ("hear|t", "lu-j|ah"): back up to the syllable start (word start
    // or just after a hyphen). A chord deep in the front of a long unhyphenated word
    // ("Al|mighty") is placed on purpose and stays. Never back onto or past the
    // previous chord. Latin script only — in CJK every character is a syllable.
    let s = k
    while (isLetter(s) && isLetter(s - 1)) s--
    let e = k
    while (isLetter(e)) e++
    const before = k - s
    if (before > 0 && s > prevK && (before === 1 || e - k <= before)) k = s
    prevK = k
    if (!at.has(k)) at.set(k, [])
    at.get(k).push({ name, x })
  })

  // Several chords piling onto the first word means whole bars are played before
  // the line starts (e.g. "| G | D | Am" over "You alone…"). The last one belongs to
  // the first word; the earlier ones far to its left go on their own line. A single
  // chord left of an indented lyric is just the downbeat and stays on the word.
  const first = chars.findIndex(c => /\S/.test(c))
  const atFirst = at.get(first) ?? []
  const leadIn = atFirst.slice(0, -1).filter(c => start - c.x > LEAD_IN_GAP)
  if (leadIn.length) at.set(first, atFirst.filter(c => !leadIn.includes(c)))

  let lyric = ''
  for (let i = 0; i <= chars.length; i++) {
    if (i === chars.length && at.has(i)) lyric += ' '
    for (const { name } of at.get(i) ?? []) lyric += `[${name}]`
    if (i < chars.length) lyric += chars[i]
  }

  const out = []
  if (leadIn.length) out.push(leadIn.map(c => `[${c.name}]`).join('    '))
  out.push(tidy(lyric))
  return out
}

// A short lyric pushed far right on its own line, sitting above the next chord line,
// is a pickup ("Give You" before "Ev'rything") that ends the previous sung line.
function isPickupLyric(src) {
  const start = firstInkX(src)
  const width = src.xs[src.chars.length] - start
  return start !== Infinity && start > 2 * width
}

const SECTION_RE = /^(verse|chorus|bridge|intro|outro|pre.?chorus|tag|refrain|interlude|coda|hook|vamp|ending|instrumental|turnaround|modulation|key\s+change)\b/i
const META_RE    = /^((original\s+key[^:]*:|key\s+sig[^:]*:|play\s+in[^:]*:|capo\s*:|tempo\s*:|time\s+sig[^:]*:|sequence\s*:|ccli[^:]*:|song\s+no[^:]*:|hp\s+recording[^:]*:|writer[^:]*:|author[^:]*:|arr\.?[^:]*:|arrangement[^:]*:)|(written\s+by|produced?\s+by|co-?produced\s+by|strumming\s+pattern)\s+)/i
const CREDIT_RE  = /@\s+(?:[A-Za-z]+\s+)?\d{4}/

// Lines of the song header block ("Title - Artist @ 1991", "Original Key…", "Play in
// Key…", "Sequence:"). Seen again after the chart has started, they open another copy
// of the song — a lyrics-only version, or the chart repeated — so parsing stops.
const SONG_HEADER_RE = new RegExp(
  `${CREDIT_RE.source}|^(original\\s+key|play\\s+in|sequence\\s*:)`, 'i')

// Matches "Play in G key", "Play in Key: G", "Play in Eb" etc.
// The optional (?:key[\s:]*) handles "key:" or "key " before the note name.
const PLAY_IN_KEY_RE = /play\s+in\s+(?:key[\s:]*)?([A-G][b#]?)\b/i

function stripHTML(html) {
  // Remove <style> and <script> block content (not just the tags)
  let s = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  // In real markup, source whitespace renders as a single space — only block tags
  // break lines. Word-pasted posts (MsoNormal, ~2017) wrap long chord and lyric lines
  // with raw newlines mid-text; keeping those as line breaks shreds the chord rows.
  // (&nbsp; is unaffected: it is still an entity at this point.)
  const isMarkup = /<(div|br|p)\b/i.test(s)
  if (isMarkup) s = s.replace(/[ \t\r\n]+/g, ' ')
  s = s.replace(/<\/(div|p|li|tr)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = s.replace(/&amp;/g, '&')
  s = s.replace(/&lt;/g, '<')
  s = s.replace(/&gt;/g, '>')
  s = s.replace(/&quot;/g, '"')
  s = s.replace(/&#39;/g, "'")
  s = s.replace(/&nbsp;|&#160;/g, '\u00a0')
  s = s.replace(/&apos;/g, "'")
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  s = s.replace(/&rsquo;|&lsquo;|\u2019|\u2018/g, "'")
  s = s.replace(/&rdquo;|&ldquo;|\u201c|\u201d/g, '"')
  // Collapsible spaces at the start/end of a rendered line are dropped; &nbsp; is not
  if (isMarkup) s = s.split('\n').map(l => l.replace(/^ +| +$/g, '')).join('\n')
  return s.replace(/\u00a0/g, ' ')
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
  if (isDCChordLine(trimmed)) return { type: T_CHORD, text: trimmed }
  return { type: T_LYRIC, text: trimmed }
}

// "Key Signature: A" not preceded by "Original" — the key the chart is written in,
// e.g. "Original Key Signature: E (Male Singer)    Key Signature: A (Female Singer)"
const CHART_KEY_SIG_RE = /(?<!original\s+)\bkey\s+sig\w*\s*:\s*([A-G][b#]?)/i

// The chart is written in the "Play in" key; the original (recording) key is only a
// fallback. Posts often give both, sometimes on separate lines in either order, and
// the original can be a list like "D#/Eb-F-F#/Gb".
function parseMeta(metaState, line) {
  const lower = line.toLowerCase()
  const colonIdx = line.indexOf(':')
  const value = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : ''

  const play = PLAY_IN_KEY_RE.exec(line) ?? CHART_KEY_SIG_RE.exec(line)
  if (play) {
    if (!metaState.playKey) {
      metaState.playKey = play[1]
      // Extract capo from remainder after the "Play in Key: X" match
      if (!metaState.capo) {
        const capoM = /capo\s+(\d+)/i.exec(line.slice(play.index + play[0].length))
        if (capoM) metaState.capo = capoM[1]
      }
    }
  } else if (/^original\s+key|^key\s+sig/i.test(lower)) {
    if (!metaState.originalKey) {
      const m = /^([A-G][b#]?m?)/.exec(value.replace(/\(.*?\)/, '').trim())
      if (m) metaState.originalKey = m[1]
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
 * @param {string} rawHtml - full page HTML from Firecrawl /scrape, or the post body from the Blogger feed
 * @param {{ title: string, artist: string, chartKey?: string|null }} titleMeta - pre-parsed from the search result
 */
export function parseDanielChoyPage(rawHtml, titleMeta) {
  const html = extractPostBody(rawHtml ?? '')
  const text = stripHTML(html)
  // Fix "Verse" + "1" HTML-split before classification so seenSections keys are correct
  const rawLines = patchSectionLines(text.split('\n')).map(l => l.replace(/\r$/, ''))

  const metaState = { playKey: '', originalKey: '', capo: '' }
  const classified = []
  const seenSections = {}
  let contentStarted = false

  // Every post repeats the song underneath the chart as lyrics only, introduced by
  // the same "Title - Artist @ year" credit block. A section name recurring with
  // plain lyrics under it (no chord line) is the same signal for posts without one.
  const nextNonBlank = (from) => rawLines.slice(from).find(l => l.trim())
  const startsLyricsOnlyCopy = (idx, sectionName) => {
    const key = sectionName.toLowerCase()
    seenSections[key] = (seenSections[key] ?? 0) + 1
    if (seenSections[key] === 1) return false
    const next = nextNonBlank(idx + 1)
    return !next || classifyLine(next).type === T_LYRIC
  }

  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx]
    const src = toSource(line)

    // "Intro: | chords |" — colon-split into section + chord line
    const colonIdx = src.chars.indexOf(':')
    if (colonIdx > 0) {
      const potential = src.chars.slice(0, colonIdx).join('').trim()
      const restSrc = sliceSource(src, colonIdx + 1)
      const rest = restSrc.chars.join('').trim()
      if (SECTION_RE.test(potential) && potential.split(/\s+/).length <= 4 && rest) {
        contentStarted = true
        seenSections[potential.toLowerCase()] = (seenSections[potential.toLowerCase()] ?? 0) + 1
        classified.push({ type: T_SECTION, text: potential })
        if (isDCChordLine(rest)) classified.push({ type: T_CHORD, text: rest, src: restSrc })
        continue
      }
    }

    const cl = { ...classifyLine(line), src }
    if (cl.type === T_META && contentStarted && SONG_HEADER_RE.test(cl.text)) break
    if (contentStarted && FOOTER_RE.test(cl.text)) break
    if (cl.type === T_META) parseMeta(metaState, cl.text)
    if (cl.type === T_SECTION) {
      if (startsLyricsOnlyCopy(idx, cl.text)) break
      contentStarted = true
    }
    if (cl.type === T_CHORD) contentStarted = true
    if (!contentStarted && (cl.type === T_LYRIC || cl.type === T_BLANK)) continue

    const alt = cl.type === T_LYRIC && ALT_CHORDS_RE.exec(cl.text)
    if (alt && isDCChordLine(alt[1])) {
      classified.push({ type: T_NOTE, text: 'Or' })
      classified.push({ type: T_CHORD, text: alt[1], src: toSource(alt[1]) })
      continue
    }
    classified.push(cl)
  }

  // Fallback: if filter removed everything, parse without preamble suppression
  if (classified.length === 0) {
    for (const rawLine of rawLines) {
      classified.push({ ...classifyLine(rawLine), src: toSource(rawLine) })
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
    if (cl.type === T_NOTE)    { outputLines.push(cl.text); i++; continue }

    // Skip standalone rhythm artifacts (|, -, bare bar lines, "- - | (2x)" etc.) misclassified as lyrics
    if (cl.type === T_LYRIC && isPureRhythmLine(cl.text)) { i++; continue }

    if (cl.type === T_CHORD) {
      // Accumulate consecutive single-chord lines — Blogger HTML sometimes puts each
      // chord in its own <div>, producing fragments that belong together. Lines with
      // several chords are complete rows (e.g. a two-row interlude) and stay separate.
      const single = (c) => c.type === T_CHORD && chordTokens(c.src).length === 1
      const chordParts = [cl]
      let j = i + 1
      if (single(cl)) {
        while (j < classified.length && single(classified[j])) chordParts.push(classified[j++])
      }

      // Skip past pure-rhythm lyric artifacts between chord block and real lyrics
      while (j < classified.length && classified[j].type === T_LYRIC && isPureRhythmLine(classified[j].text)) {
        j++
      }

      const isFragmented = chordParts.length > 1
      const chordText = chordParts.map(c => c.text).join('  ')
      const hasChords = chordParts.some(c => chordTokens(c.src).length > 0)

      const next = classified[j]
      if (next && next.type === T_LYRIC && hasChords) {
        if (!isFragmented) {
          outputLines.push(...mergeByPosition(cl.src, next.src))
        } else {
          // Fragmented: column positions lost from div-per-chord HTML — keep separate
          outputLines.push(toPureChordLine(stripRhythmTokens(chordText)))
          outputLines.push(tidy(next.text))
        }
        i = j + 1
      } else if (hasChords) {
        outputLines.push(toPureChordLine(stripRhythmTokens(chordText)))
        i = j
      } else {
        i = j // rhythm-only, skip
      }
      continue
    }

    // Lyric
    const prev = outputLines[outputLines.length - 1]
    if (classified[i + 1]?.type === T_CHORD && prev?.trim() && !prev.startsWith('{c:') && isPickupLyric(cl.src)) {
      outputLines[outputLines.length - 1] = `${prev} ${tidy(cl.text)}`
    } else {
      outputLines.push(tidy(cl.text))
    }
    i++
  }

  // Trim trailing blank lines
  while (outputLines.length > 0 && !outputLines[outputLines.length - 1].trim()) {
    outputLines.pop()
  }

  const contentString = outputLines.join('\n')

  // Key label only — the chords are kept exactly as written. The "X Chord" in the post
  // title is the key the chart is in; the post's "Play in Key" header occasionally
  // describes another version (What A God, D Chord: header says A), and chord-frequency
  // detection misreads songs that borrow chords (a G song with F and C reads as C).
  // Transposing to either of those corrupted correctly-written charts.
  const titleKey = titleMeta.chartKey ?? chartKeyFromTitle(PAGE_TITLE_RE.exec(rawHtml ?? '')?.[1])
  const keyInfo = resolveKey(titleKey)
    ?? resolveKey(metaState.playKey || metaState.originalKey)
    ?? detectKeyFromContent(contentString)

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
