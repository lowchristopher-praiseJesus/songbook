const SECTION_RE = /^\{c:\s*(.+?)\s*\}$/
const NOTE_RE = /^\{note:\s*(.*?)\s*\}$/

export function parseContent(content) {
  if (!content) return []

  const rawLines = content.split('\n')
  const sections = []
  let current = null
  let i = 0

  function peekNote() {
    if (i + 1 < rawLines.length) {
      const m = rawLines[i + 1].match(NOTE_RE)
      if (m) { i++; return m[1] }
    }
    return null
  }

  while (i < rawLines.length) {
    const rawLine = rawLines[i]

    // Consume standalone {note:} lines not attached to any element
    if (NOTE_RE.test(rawLine)) {
      i++
      continue
    }

    const sectionMatch = rawLine.match(SECTION_RE)
    if (sectionMatch) {
      const annotation = peekNote()
      current = { label: sectionMatch[1], annotation, lines: [] }
      sections.push(current)
      i++
      continue
    }

    if (!current) {
      current = { label: '', annotation: null, lines: [] }
      sections.push(current)
    }

    if (rawLine.trim() === '') {
      current.lines.push({ type: 'blank', content: '', chords: [], annotation: null })
      i++
      continue
    }

    const annotation = peekNote()
    const line = { ...parseLine(rawLine), annotation }
    current.lines.push(line)
    i++
  }

  return sections
}

function parseLine(rawLine) {
  const chords = []
  let lyric = ''
  let i = 0

  while (i < rawLine.length) {
    if (rawLine[i] === '[') {
      const close = rawLine.indexOf(']', i + 1)
      if (close === -1) {
        lyric += rawLine[i++]
        continue
      }
      const candidate = rawLine.slice(i + 1, close)
      if (isChord(candidate)) {
        let strum = null
        let nextPos = close + 1
        const strumMatch = rawLine.slice(nextPos).match(/^\{strum:\s*(.*?)\s*\}/)
        if (strumMatch) {
          strum = strumMatch[1] || null
          nextPos += strumMatch[0].length
        }
        chords.push({ chord: candidate, position: lyric.length, strum })
        i = nextPos
      } else {
        lyric += rawLine[i++]
      }
    } else {
      lyric += rawLine[i++]
    }
  }

  const isPureChordLine = lyric.trim() === '' && chords.length > 0

  return {
    type: isPureChordLine ? 'chord' : 'lyric',
    content: isPureChordLine ? '' : lyric,
    chords,
  }
}

const CHORD_RE = /^[A-G][b#]?(?:maj|min|m|M|aug|dim|sus[24]?|add)?[0-9]{0,2}(?:\/[A-G][b#]?)?$/

export function isChord(str) {
  return CHORD_RE.test(str.trim())
}
