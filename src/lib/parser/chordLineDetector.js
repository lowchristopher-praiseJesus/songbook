import { isChordLine, mergeChordAboveLyric, toPureChordLine } from './chordLineUtils'

const SECTION_RE = /^\{c:\s*(.+?)\s*\}$/
const INLINE_CHORD_RE = /\[.+?\]/

// Returns array of { type, chordLineIndex, lyricLineIndex, original, proposed } for
// merge detections, or { type, lineIndex, original, proposed } for standalone ones.
export function detectChordFixes(rawText) {
  const lines = rawText.split('\n')
  const results = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue
    if (SECTION_RE.test(trimmed)) continue
    if (INLINE_CHORD_RE.test(trimmed)) continue
    if (!isChordLine(line)) continue

    const next = lines[i + 1]
    const nextTrimmed = next?.trim() ?? ''
    const nextIsLyric = next !== undefined && nextTrimmed !== '' &&
      !SECTION_RE.test(nextTrimmed) && !isChordLine(next)

    if (nextIsLyric) {
      results.push({
        type: 'merge',
        chordLineIndex: i,
        lyricLineIndex: i + 1,
        original: `${line}\n${next}`,
        proposed: mergeChordAboveLyric(line, next),
      })
      i++ // consume the lyric line so it isn't re-examined as its own line
    } else {
      results.push({
        type: 'standalone',
        lineIndex: i,
        original: line,
        proposed: toPureChordLine(line),
      })
    }
  }

  return results
}

// Returns updated rawText with selected detections applied: merge detections delete
// the chord line and replace the lyric line; standalone detections replace their line.
export function applyChordFixes(rawText, selectedDetections) {
  const lines = rawText.split('\n')
  const deletions = new Set()
  const replacements = new Map()

  for (const d of selectedDetections) {
    if (d.type === 'merge') {
      deletions.add(d.chordLineIndex)
      replacements.set(d.lyricLineIndex, d.proposed)
    } else {
      replacements.set(d.lineIndex, d.proposed)
    }
  }

  return lines
    .map((line, i) => (replacements.has(i) ? replacements.get(i) : line))
    .filter((_, i) => !deletions.has(i))
    .join('\n')
}
