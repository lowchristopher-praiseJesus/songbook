import { isChord } from './contentParser'

export const KNOWN_SECTIONS = [
  'Verse', 'Chorus', 'Bridge', 'Pre-Chorus',
  'Intro', 'Outro', 'Tag', 'Refrain',
  'Instrumental', 'Hook', 'Solo', 'Interlude',
  'Break', 'Coda', 'Vamp',
]

const ALIASES = {
  'prechorus': 'Pre-Chorus',
  'pre chorus': 'Pre-Chorus',
  'pre-chorus': 'Pre-Chorus',
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] :
        1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

// Returns { name, confidence } if candidate matches a known section, else null.
function matchSection(candidate) {
  const lower = candidate.toLowerCase()
  if (ALIASES[lower]) return { name: ALIASES[lower], confidence: 'high' }

  // Strip trailing number: "Verse 1" → base "Verse", suffix " 1"
  const numbered = candidate.match(/^(.+?)\s+(\d+)$/)
  const base = numbered ? numbered[1].trim() : candidate
  const suffix = numbered ? ` ${numbered[2]}` : ''
  const lowerBase = base.toLowerCase()

  const exact = KNOWN_SECTIONS.find(s => s.toLowerCase() === lowerBase)
  if (exact) return { name: exact + suffix, confidence: 'high' }

  // Fuzzy: threshold 1 for short words (≤5 chars), 2 for longer
  let best = null, bestDist = Infinity
  for (const s of KNOWN_SECTIONS) {
    const dist = levenshtein(lowerBase, s.toLowerCase())
    const threshold = Math.min(base.length, s.length) <= 5 ? 1 : 2
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist
      best = s
    }
  }
  if (best) return { name: best + suffix, confidence: 'low' }

  return null
}

// Returns array of { lineIndex, original, proposed, confidence }.
export function detectSectionHeaders(rawText) {
  const lines = rawText.split('\n')
  const results = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue
    if (/^\{c:\s/.test(trimmed)) continue  // already proper syntax

    // [Section] bracket format
    const bracketMatch = trimmed.match(/^\[([^\]]+)\]$/)
    if (bracketMatch) {
      const inner = bracketMatch[1].trim()
      if (isChord(inner)) continue  // skip actual chords like [Am], [G7]
      const match = matchSection(inner)
      const proposed = match ? `{c: ${match.name}}` : `{c: ${inner}}`
      results.push({ lineIndex: i, original: line, proposed, confidence: 'high' })
      continue
    }

    // ## Heading format
    const headingMatch = trimmed.match(/^##\s+(.+)$/)
    if (headingMatch) {
      const name = headingMatch[1].trim()
      const match = matchSection(name)
      const proposed = match ? `{c: ${match.name}}` : `{c: ${name}}`
      results.push({ lineIndex: i, original: line, proposed, confidence: 'high' })
      continue
    }

    // Skip lines that contain inline chords (chord tokens embedded in text)
    if (/\[.+?\]/.test(trimmed)) continue

    // Skip pure chord-sequence lines: every space-separated token is a chord
    const tokens = trimmed.split(/\s+/)
    if (tokens.length > 1 && tokens.every(t => isChord(t))) continue

    // Plain text: section names are short (≤3 tokens)
    if (tokens.length > 3) continue

    // Strip trailing colon before matching
    const stripped = trimmed.replace(/:$/, '').trim()

    // "Section X" pattern: "Section A1", "Section B1", "Section A", etc.
    const sectionPrefixMatch = stripped.match(/^section\s+(\S+)$/i)
    if (sectionPrefixMatch) {
      results.push({
        lineIndex: i,
        original: line,
        proposed: `{c: Section ${sectionPrefixMatch[1]}}`,
        confidence: 'high',
      })
      continue
    }

    const match = matchSection(stripped)
    if (match) {
      results.push({
        lineIndex: i,
        original: line,
        proposed: `{c: ${match.name}}`,
        confidence: match.confidence,
      })
    }
  }

  return results
}

// Returns updated rawText with detected lines replaced by their proposed syntax.
export function convertSectionHeaders(rawText, detections) {
  const lines = rawText.split('\n')
  const byIndex = new Map(detections.map(d => [d.lineIndex, d.proposed]))
  return lines.map((line, i) => byIndex.has(i) ? byIndex.get(i) : line).join('\n')
}
