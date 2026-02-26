function ChordedLine({ line, fontSize }) {
  const text = line.content
  const chords = line.chords ?? []

  if (chords.length === 0) {
    return <span>{text}</span>
  }

  const parts = []
  let lastPos = 0

  for (const { chord, position } of chords) {
    // Text between last chord and this one
    if (position > lastPos) {
      parts.push(<span key={`t-${lastPos}`}>{text.slice(lastPos, position)}</span>)
    }
    // Chord superscript + the character at this position
    parts.push(
      <span key={`c-${position}`} className="relative inline-block">
        <span
          className="absolute -top-5 left-0 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap select-none"
          style={{ fontSize: Math.max(11, (fontSize ?? 16) - 3) }}
          aria-hidden="true"
        >
          {chord}
        </span>
        {text[position] ?? '\u00A0'}
      </span>
    )
    lastPos = position + 1
  }

  // Remaining text after last chord
  if (lastPos < text.length) {
    parts.push(<span key="t-end">{text.slice(lastPos)}</span>)
  }

  return <span>{parts}</span>
}

function SongSection({ section, fontSize, performanceMode }) {
  const lines = section.lines
  return (
    <div className="mb-8" data-section>
      {section.label && (
        <h3 className={`font-semibold uppercase tracking-widest mb-3 text-indigo-500 dark:text-indigo-400
          ${performanceMode ? 'text-sm' : 'text-xs'}`}>
          {section.label}
        </h3>
      )}
      <div className="space-y-0">
        {lines.map((line, i) => {
          if (line.type === 'blank') {
            return <div key={i} className="h-4" />
          }
          if (line.type === 'chord') {
            // If immediately followed by a lyric line, skip standalone rendering —
            // chords will be merged into the lyric line below.
            if (lines[i + 1]?.type === 'lyric') return null
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
                className="font-mono font-bold text-indigo-600 dark:text-indigo-400 leading-none mb-1 whitespace-pre"
                style={{ fontSize: Math.max(12, (fontSize ?? 16) - 2) }}
                aria-hidden="true"
              >
                {lineStr}
              </div>
            )
          }
          // Lyric line — merge chords from any immediately preceding chord line
          // so they all render uniformly above the text at the same size.
          let effectiveChords = line.chords ?? []
          const prevLine = lines[i - 1]
          if (prevLine?.type === 'chord') {
            const merged = [...(prevLine.chords ?? []), ...effectiveChords]
            merged.sort((a, b) => a.position - b.position)
            effectiveChords = merged
          }
          const effectiveLine = { ...line, chords: effectiveChords }
          return (
            <div
              key={i}
              className="leading-relaxed"
              style={{
                paddingTop: effectiveChords.length > 0 ? '1.5rem' : '0',
                fontSize,
              }}
            >
              <ChordedLine line={effectiveLine} fontSize={fontSize} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SongBody({ sections, fontSize = 16, performanceMode = false }) {
  if (!sections?.length) return null
  return (
    <div className="py-4">
      {sections.map((section, i) => (
        <SongSection key={i} section={section} fontSize={fontSize} performanceMode={performanceMode} />
      ))}
    </div>
  )
}
