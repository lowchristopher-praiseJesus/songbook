const STRINGS_X = [14, 25, 36, 47, 58, 69]
const ROW_Y = [35, 53, 71, 89]
const FRET_Y = [44, 62, 80, 98]

export function ChordDiagramSVG({ fingering, name }) {
  const { frets, fingers, baseFret, barres } = fingering

  // Determine which string indices are part of a barre.
  // The barre finger is the lowest non-zero finger value at the barre fret row.
  const barreStringSet = new Set()
  for (const barreFret of barres) {
    const barreFingers = frets
      .map((f, i) => (f === barreFret && fingers[i] > 0 ? fingers[i] : null))
      .filter(f => f !== null)
    if (barreFingers.length === 0) continue
    const barreFinger = Math.min(...barreFingers)
    frets.forEach((f, i) => {
      if (f === barreFret && fingers[i] === barreFinger) barreStringSet.add(i)
    })
  }

  return (
    <svg viewBox="0 0 84 116" width={84} height={116} aria-hidden="true">

      {/* Chord name at top */}
      <text
        x="42" y="10"
        textAnchor="middle"
        fontSize="9" fontWeight="600"
        fontFamily="system-ui, sans-serif"
        className="fill-gray-900 dark:fill-gray-50"
      >
        {name}
      </text>

      {/* Open ○ / muted ✕ markers above the nut */}
      {frets.map((fret, i) => {
        const cx = STRINGS_X[i]
        if (fret === -1) {
          return (
            <g key={i}>
              <line x1={cx - 4} y1="14" x2={cx + 4} y2="20"
                strokeWidth="1.5" strokeLinecap="round"
                className="stroke-gray-500 dark:stroke-gray-500" />
              <line x1={cx + 4} y1="14" x2={cx - 4} y2="20"
                strokeWidth="1.5" strokeLinecap="round"
                className="stroke-gray-500 dark:stroke-gray-500" />
            </g>
          )
        }
        if (fret === 0) {
          return (
            <circle key={i} cx={cx} cy="17" r="4"
              fill="none" strokeWidth="1.5"
              className="stroke-gray-600 dark:stroke-gray-400" />
          )
        }
        return null
      })}

      {/* Nut (baseFret=1) or thin top line + fret-position label (baseFret>1) */}
      {baseFret === 1
        ? <rect x="14" y="22" width="55" height="4"
            className="fill-gray-900 dark:fill-gray-100" />
        : <>
            <line x1="14" y1="26" x2="69" y2="26"
              strokeWidth="1"
              className="stroke-gray-500 dark:stroke-gray-500" />
            <text x="72" y="38" fontSize="7"
              fontFamily="system-ui, sans-serif"
              className="fill-gray-500 dark:fill-gray-400">
              {baseFret}fr
            </text>
          </>
      }

      {/* String lines (vertical) */}
      {STRINGS_X.map(x => (
        <line key={x} x1={x} y1="26" x2={x} y2="98"
          strokeWidth="1"
          className="stroke-gray-500 dark:stroke-gray-500" />
      ))}

      {/* Fret lines (horizontal) */}
      {FRET_Y.map(y => (
        <line key={y} x1="14" y1={y} x2="69" y2={y}
          strokeWidth="0.75"
          className="stroke-gray-300 dark:stroke-gray-700" />
      ))}

      {/* Barre bars */}
      {barres.map(barreFret => {
        const barreIndices = [...barreStringSet].filter(i => frets[i] === barreFret).sort((a,b) => a-b)
        if (barreIndices.length < 2) return null
        const x1 = STRINGS_X[barreIndices[0]]
        const x2 = STRINGS_X[barreIndices[barreIndices.length - 1]]
        const cy = ROW_Y[barreFret - 1]
        const barreFinger = fingers[barreIndices[0]]
        return (
          <g key={barreFret}>
            <rect x={x1} y={cy - 5} width={x2 - x1} height={10} rx="5"
              className="fill-gray-800 dark:fill-gray-200" />
            <text x={(x1 + x2) / 2} y={cy + 3.5}
              textAnchor="middle" fontSize="7"
              fontFamily="system-ui, sans-serif"
              className="fill-white dark:fill-gray-900">
              {barreFinger}
            </text>
          </g>
        )
      })}

      {/* Finger dots (fretted non-barre strings) */}
      {frets.map((fret, i) => {
        if (fret <= 0 || barreStringSet.has(i)) return null
        const cx = STRINGS_X[i]
        const cy = ROW_Y[fret - 1]
        const finger = fingers[i]
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="6"
              className="fill-gray-800 dark:fill-gray-200" />
            {finger > 0 && (
              <text x={cx} y={cy + 3.5}
                textAnchor="middle" fontSize="7"
                fontFamily="system-ui, sans-serif"
                className="fill-white dark:fill-gray-900">
                {finger}
              </text>
            )}
          </g>
        )
      })}

    </svg>
  )
}
