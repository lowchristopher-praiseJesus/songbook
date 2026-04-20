function ChordedLine({ line, fontSize, fitMode }) {
  const text = line.content
  const chords = line.chords ?? []
  const chordFontSize = Math.max(11, (fontSize ?? 16) - 3)

  if (chords.length === 0) {
    return <span>{text}</span>
  }

  // Build a position → chord lookup.
  const chordAt = new Map(chords.map(({ chord, position }) => [position, chord]))

  // Segment the text into word-groups (non-space runs) and spaces.
  // Each word-group is wrapped in white-space:nowrap so that inline-block
  // chord anchors inside a word never create a spurious line-break point
  // between them and the adjacent characters of the same word.
  const groups = []
  let i = 0
  while (i < text.length) {
    if (text[i] === ' ') {
      if (chordAt.has(i)) {
        // Chord aligned above a space — render as a single-space word with chord above
        groups.push({ type: 'word', parts: [{ type: 'chord', chord: chordAt.get(i), char: ' ', key: i }], key: i })
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
          parts.push({ type: 'chord', chord: chordAt.get(i), char: text[i], key: i })
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
  for (const { chord, position } of chords) {
    if (position >= text.length) {
      groups.push({ type: 'word', parts: [{ type: 'chord', chord, char: ' ', key: position }], key: position })
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
                      // The chord label is absolute-positioned and doesn't expand the container.
                      // Apply minWidth when there's nothing to the right to act as a buffer:
                      //   • char === ' ': container is only 1 nbsp wide (end-of-line or space anchor)
                      //   • last part in the word group: no following lyric chars in the same word
                      //     (e.g. [Dsus]e at end of "grace", [Asus]t at end of "first")
                      ...((part.char === ' ' || pi === group.parts.length - 1)
                        ? { minWidth: `${part.chord.length * 0.7 + 0.3}em` }
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
                      {part.chord}
                    </span>
                    {part.char === ' ' ? '\u00A0' : part.char}
                  </span>
                )
            )}
          </span>
        )
      })}
    </span>
  )
}

function SongSection({ section, fontSize, performanceMode, lyricsOnly, fitMode, annotationsVisible = true }) {
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
    <div className="mb-8" data-section>
      {section.label && (
        <h3
          className="font-semibold uppercase tracking-widest mb-3"
          style={{ fontFamily: 'var(--section-font)', fontSize: 'var(--section-size)', color: 'var(--section-color-active)' }}
        >
          {section.label}
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
            // Standalone chord line (e.g. instrumental break with no lyric below)
            const chords = line.chords ?? []
            let lineStr = ''
            for (const { chord, position } of chords) {
              while (lineStr.length < position) lineStr += ' '
              lineStr += chord
              lineStr += ' '
            }
            return (
              <div
                key={i}
                className="font-bold leading-none mb-1 whitespace-pre"
                style={fitMode
                  ? { fontSize: 'max(12px, calc(var(--fit-fs, 16px) + var(--chord-size-offset, -3px)))', fontFamily: 'var(--chord-font)', color: 'var(--chord-color-active)' }
                  : { fontSize: 'max(12px, calc(var(--lyrics-size, 16px) + var(--chord-size-offset, -3px)))', fontFamily: 'var(--chord-font)', color: 'var(--chord-color-active)' }
                }
                aria-hidden="true"
              >
                {lineStr}
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
}

export function SongBody({ sections, fontSize = 16, performanceMode = false, lyricsOnly = false, fitMode = false, fitColumns, annotationsVisible = true }) {
  if (!sections?.length) return null
  return (
    <div
      className="py-4"
      style={fitMode && fitColumns ? { columnCount: fitColumns } : undefined}
    >
      {sections.map((section, i) => (
        <SongSection
          key={i}
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
