import React from 'react'

function ChordedLine({ line, fontSize, fitMode }) {
  const text = line.content
  const chords = line.chords ?? []
  const chordFontSize = Math.max(11, (fontSize ?? 16) - 3)

  if (chords.length === 0) {
    return <span>{text}</span>
  }

  // Build a position → chord object lookup (includes strum).
  const chordAt = new Map(chords.map((c) => [c.position, c]))

  // A chord label is absolute-positioned, so it only needs reserved width (minWidth)
  // to avoid colliding with the NEXT chord. When the next chord is far enough away that
  // the intervening lyric text already provides room, reserving width would instead
  // split a word (e.g. "belo[Em]ved" → "belo  ved"). So reserve only when the chord
  // label is wider than the gap of lyric text before the next chord.
  const LYRIC_CHAR_EM = 0.5 // approximate width of one proportional lyric character
  const sortedPositions = chords.map((c) => c.position).sort((a, b) => a - b)
  function chordNeedsWidth(position, chordText) {
    const next = sortedPositions.find((p) => p > position)
    if (next === undefined) return false // nothing to the right to collide with
    const gapEm = (next - position) * LYRIC_CHAR_EM
    const chordEm = chordText.length * 0.7 + 0.3
    return chordEm > gapEm
  }

  // Segment the text into word-groups (non-space runs) and spaces.
  // Each word-group is wrapped in white-space:nowrap so that inline-block
  // chord anchors inside a word never create a spurious line-break point
  // between them and the adjacent characters of the same word.
  const groups = []
  let i = 0
  while (i < text.length) {
    if (text[i] === ' ') {
      if (chordAt.has(i)) {
        const c = chordAt.get(i)
        groups.push({ type: 'word', parts: [{ type: 'chord', chord: c.chord, strum: c.strum, char: ' ', key: i }], key: i })
      } else {
        groups.push({ type: 'space', key: i })
      }
      i++
    } else {
      const groupStart = i
      const parts = []
      let bufStart = i
      let buf = ''
      while (i < text.length && text[i] !== ' ') {
        if (chordAt.has(i)) {
          if (buf) { parts.push({ type: 'text', text: buf, key: bufStart }); buf = '' }
          const c = chordAt.get(i)
          parts.push({ type: 'chord', chord: c.chord, strum: c.strum, char: text[i], key: i })
          bufStart = i + 1
        } else {
          buf += text[i]
        }
        i++
      }
      if (buf) parts.push({ type: 'text', text: buf, key: bufStart })
      groups.push({ type: 'word', parts, key: groupStart })
    }
  }

  // Chords positioned at or past end of text (e.g. chord aligned beyond last lyric char)
  for (const { chord, strum, position } of chords) {
    if (position >= text.length) {
      groups.push({ type: 'word', parts: [{ type: 'chord', chord, strum, char: ' ', key: position }], key: position })
    }
  }

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {groups.map((group) => {
        if (group.type === 'space') {
          return <span key={`sp${group.key}`}> </span>
        }
        return (
          <span key={`w${group.key}`} style={{ whiteSpace: 'nowrap' }}>
            {group.parts.map((part, pi) =>
              part.type === 'text'
                ? <span key={`t${part.key}`}>{part.text}</span>
                : (
                  <span
                    key={`c${part.key}`}
                    className="relative inline-block"
                    style={{
                      paddingTop: '1.3em',
                      // Reserve width only when this chord's label would collide with the next
                      // chord; otherwise let it overhang the following lyric chars without
                      // splitting the word. See chordNeedsWidth above.
                      ...(chordNeedsWidth(part.key, part.chord + (part.strum || ''))
                        ? { minWidth: `${(part.chord + (part.strum || '')).length * 0.7 + 0.3}em` }
                        : {}),
                    }}
                  >
                    <span
                      className="absolute top-0 left-0 font-bold whitespace-nowrap select-none"
                      style={fitMode
                        ? { fontSize: 'max(11px, calc(var(--fit-fs, 16px) + var(--chord-size-offset, -3px)))', lineHeight: 1.2, fontFamily: 'var(--chord-font)', color: 'var(--chord-color-active)' }
                        : { fontSize: 'max(11px, calc(var(--lyrics-size, 16px) + var(--chord-size-offset, -3px)))', lineHeight: 1.2, fontFamily: 'var(--chord-font)', color: 'var(--chord-color-active)' }
                      }
                      aria-hidden="true"
                    >
                      {part.chord}{part.strum || ''}
                    </span>
                    {part.char === ' ' ? ' ' : part.char}
                  </span>
                )
            )}
          </span>
        )
      })}
    </span>
  )
}

const SongSection = React.forwardRef(function SongSection(
  { section, fontSize, performanceMode, lyricsOnly, fitMode, annotationsVisible = true },
  ref
) {
  const lines = section.lines

  // Pre-compute which chord-only lines will be absorbed into a following lyric line
  // (scanning forward past any blank lines to find the next non-blank line).
  const absorbedChordLines = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type === 'chord') {
      let j = i + 1
      while (j < lines.length && lines[j].type === 'blank') j++
      if (j < lines.length && lines[j].type === 'lyric') {
        absorbedChordLines.add(i)
      }
    }
  }

  return (
    <div ref={ref} className="mb-8" data-section>
      {section.label && (
        <h3 className="mb-3">
          <span
            className="inline-block font-semibold uppercase tracking-widest"
            style={{
              fontFamily: 'var(--section-font)',
              fontSize: 'var(--section-size)',
              color: 'var(--section-color-active)',
              border: '2px solid var(--section-color-active)',
              borderRadius: '6px',
              padding: '2px 10px',
            }}
          >
            {section.label}
          </span>
          {annotationsVisible && section.annotation && (
            <span
              className="ml-2 font-normal normal-case tracking-normal italic"
              style={{ fontFamily: 'var(--annotation-font)', fontSize: 'var(--annotation-size)', color: 'var(--annotation-color-active)' }}
            >
              — {section.annotation}
            </span>
          )}
        </h3>
      )}
      <div className="space-y-0">
        {lines.map((line, i) => {
          if (line.type === 'blank') {
            return <div key={i} className="h-4" />
          }
          if (line.type === 'chord') {
            // In lyrics-only mode, skip all chord lines
            if (lyricsOnly) return null
            // If this chord line will be absorbed into a following lyric, skip it —
            // chords will be merged into the lyric line below.
            if (absorbedChordLines.has(i)) return null
            // Standalone chord line (e.g. instrumental break with no lyric below).
            // Render each chord as an inline-block span with minWidth (same coefficient
            // as ChordedLine) so proportional fonts never cause adjacent chords to overlap.
            const chords = line.chords ?? []
            const sorted = [...chords].sort((a, b) => a.position - b.position)
            const parts = []
            let cursor = 0
            for (let ci = 0; ci < sorted.length; ci++) {
              const { chord, position, strum } = sorted[ci]
              const chordText = chord + (strum || '')
              const gap = position - cursor
              if (gap > 0) parts.push(<span key={`g${ci}`} style={{ whiteSpace: 'pre' }}>{' '.repeat(gap)}</span>)
              parts.push(<span key={`ch${ci}`} style={{ display: 'inline-block', minWidth: `${chordText.length * 0.7 + 0.3}em` }}>{chordText}</span>)
              cursor = position + chordText.length
            }
            return (
              <div
                key={i}
                className="font-bold leading-none mb-1"
                style={fitMode
                  ? { fontSize: 'max(12px, calc(var(--fit-fs, 16px) + var(--chord-size-offset, -3px)))', fontFamily: 'var(--chord-font)', color: 'var(--chord-color-active)' }
                  : { fontSize: 'max(12px, calc(var(--lyrics-size, 16px) + var(--chord-size-offset, -3px)))', fontFamily: 'var(--chord-font)', color: 'var(--chord-color-active)' }
                }
                aria-hidden="true"
              >
                {parts}
              </div>
            )
          }
          // Lyric line — merge chords from any preceding absorbed chord line
          // (scanning backward past blank lines) so they all render uniformly.
          let effectiveChords = line.chords ?? []
          let j = i - 1
          while (j >= 0 && lines[j].type === 'blank') j--
          if (j >= 0 && lines[j].type === 'chord' && absorbedChordLines.has(j)) {
            const merged = [...(lines[j].chords ?? []), ...effectiveChords]
            merged.sort((a, b) => a.position - b.position)
            effectiveChords = merged
          }
          const chordsForLine = lyricsOnly ? [] : effectiveChords
          const effectiveLine = { ...line, chords: chordsForLine }
          return (
            <div
              key={i}
              className="leading-relaxed"
              style={fitMode
                ? { fontSize: 'var(--fit-fs, 16px)', fontFamily: 'var(--lyrics-font)', color: 'var(--lyrics-color-active)' }
                : { fontSize, fontFamily: 'var(--lyrics-font)', color: 'var(--lyrics-color-active)' }
              }
            >
              <ChordedLine line={effectiveLine} fontSize={fontSize} fitMode={fitMode} />
              {annotationsVisible && line.annotation && (
                <span
                  className="ml-2 italic"
                  style={{ fontFamily: 'var(--annotation-font)', fontSize: 'var(--annotation-size)', color: 'var(--annotation-color-active)' }}
                >
                  — {line.annotation}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

export function SongBody({ sections, fontSize = 16, performanceMode = false, lyricsOnly = false, fitMode = false, fitColumns, annotationsVisible = true, sectionRefs }) {
  if (!sections?.length) return null
  return (
    <div
      className="py-4"
      style={fitMode && fitColumns ? { columnCount: fitColumns } : undefined}
    >
      {sections.map((section, i) => (
        <SongSection
          key={i}
          ref={sectionRefs?.[i]}
          section={section}
          fontSize={fontSize}
          performanceMode={performanceMode}
          lyricsOnly={lyricsOnly}
          fitMode={fitMode}
          annotationsVisible={annotationsVisible}
        />
      ))}
    </div>
  )
}
