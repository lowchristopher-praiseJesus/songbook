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
  return (
    <div className="mb-8" data-section>
      {section.label && (
        <h3 className={`font-semibold uppercase tracking-widest mb-3 text-indigo-500 dark:text-indigo-400
          ${performanceMode ? 'text-sm' : 'text-xs'}`}>
          {section.label}
        </h3>
      )}
      <div className="space-y-0">
        {section.lines.map((line, i) => {
          if (line.type === 'blank') {
            return <div key={i} className="h-4" />
          }
          if (line.type === 'chord') {
            // Pure chord line — render chord tokens spaced by position
            return (
              <div
                key={i}
                className="font-mono font-bold text-indigo-600 dark:text-indigo-400 leading-none mb-1"
                style={{ fontSize: Math.max(12, (fontSize ?? 16) - 2) }}
                aria-hidden="true"
              >
                {(line.chords ?? []).map((ct, j) => (
                  <span key={j} style={{ marginRight: '1.5ch' }}>{ct.chord}</span>
                ))}
              </div>
            )
          }
          // Lyric line (with or without inline chords)
          return (
            <div
              key={i}
              className="leading-relaxed"
              style={{
                paddingTop: (line.chords?.length ?? 0) > 0 ? '1.5rem' : '0',
                fontSize,
              }}
            >
              <ChordedLine line={line} fontSize={fontSize} />
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
