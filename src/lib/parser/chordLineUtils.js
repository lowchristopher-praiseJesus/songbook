import { isChord } from './contentParser'

// Expand tab characters to 4-space tab stops
export function expandTabs(str) {
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

// Repeat annotations like 2x, x2 (parens, if any, are already stripped by the time
// this runs against a single token)
const REPEAT_ANNOTATION_RE = /^\(?\d+x\)?$|^\(?x\d+\)?$/i
// Bare rhythm-only markers: -, ^, / (not part of a slash chord like "C/G")
const RHYTHM_ONLY_RE = /^[-^/]+$/

// Replace parenthetical annotation phrases — e.g. "(2x)" or a free-text phrase like
// "(To Repeat)" spanning multiple whitespace-delimited words — with spaces of equal
// length, so column positions of surrounding chord tokens are preserved.
function stripParentheticalAnnotations(line) {
  let result = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '(') {
      const close = line.indexOf(')', i + 1)
      if (close !== -1) {
        result += ' '.repeat(close - i + 1)
        i = close + 1
        continue
      }
    }
    result += line[i]
    i++
  }
  return result
}

// Extracts whitespace/pipe-delimited tokens with their column position in the
// original (tab-expanded) line. Splitting on "|" (a bar-line separator) lets a
// token like "Bb|C" resolve to two chord candidates, "Bb" and "C", each keeping
// its own position.
function extractChordTokens(line) {
  const withoutAnnotations = stripParentheticalAnnotations(line)
  const tokens = []
  const re = /[^\s|]+/g
  let m
  while ((m = re.exec(withoutAnnotations)) !== null) {
    tokens.push({ text: m[0], pos: m.index })
  }
  return tokens
}

// A token may carry a trailing rhythm marker directly on a chord, e.g. "G-" or "Am^".
function stripTrailingRhythm(text) {
  return text.replace(/[-^/]+$/, '')
}

// True if the line is a chord-only line: at least one real chord, and every other
// token is either a chord, a rhythm marker, or a repeat annotation.
export function isChordLine(line) {
  const tokens = extractChordTokens(expandTabs(line))
  if (tokens.length === 0) return false

  const names = tokens.map(t => stripTrailingRhythm(t.text))
  const chordCount = names.filter(name => name && isChord(name)).length

  return chordCount > 0 && names.every(name =>
    !name || isChord(name) || RHYTHM_ONLY_RE.test(name) || REPEAT_ANNOTATION_RE.test(name)
  )
}

// Merge a chord-above-lyrics pair into an inline [Chord] line. Decoration tokens
// (rhythm markers, repeat annotations) are dropped; only real chords are inserted.
export function mergeChordAboveLyric(chordLine, lyricLine) {
  const expandedLyric = expandTabs(lyricLine)

  const chords = extractChordTokens(expandTabs(chordLine))
    .map(t => ({ name: stripTrailingRhythm(t.text), pos: t.pos }))
    .filter(t => t.name && isChord(t.name))

  if (chords.length === 0) return expandedLyric.trimEnd()

  const maxPos = chords[chords.length - 1].pos
  let lyric = expandedLyric.length > maxPos
    ? expandedLyric
    : expandedLyric.padEnd(maxPos + 1)

  // Insert right-to-left using original column positions directly. Right-to-left
  // means each splice only shifts characters to its right, so positions to the
  // left are unaffected — no offset adjustment needed.
  for (let i = chords.length - 1; i >= 0; i--) {
    const { name, pos } = chords[i]
    lyric = lyric.slice(0, pos) + `[${name}]` + lyric.slice(pos)
  }

  return lyric.trimEnd()
}

// Convert a chord line with no following lyric to "[G]    [D]" format, dropping
// any decoration tokens.
export function toPureChordLine(chordLine) {
  const chords = extractChordTokens(expandTabs(chordLine))
    .map(t => stripTrailingRhythm(t.text))
    .filter(name => name && isChord(name))
  return chords.map(name => `[${name}]`).join('    ')
}
