import { createRequire } from 'module'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
// The package's main entry (index.js) is missing; load guitar.json directly from lib/
const guitar = require('@tombatossals/chords-db/lib/guitar.json')

// Maps library root key names → app root names (enharmonic normalization)
// Library keys: C, Csharp, D, Eb, E, F, Fsharp, G, Ab, A, Bb, B
const ROOT_KEY_MAP = {
  'Csharp': 'Db',
  'Fsharp': 'Gb',
}

const SUFFIX_MAP = {
  'major':    '',
  'minor':    'm',
  '7':        '7',
  'maj7':     'maj7',
  'm7':       'm7',
  '6':        '6',
  'm6':       'm6',
  '9':        '9',
  'add9':     'add9',
  'dim':      'dim',
  'dim7':     'dim7',
  'aug':      '+',
  'sus2':     'sus2',
  'sus4':     'sus',
  'm9':       'm9',
  'maj9':     'maj9',
  '11':       '11',
  'm11':      'm11',
  'maj11':    'maj11',
  '13':       '13',
  'm13':      'm13',
  'maj13':    'maj13',
  '7sus4':    '7sus4',
  '5':        '5',
}

const result = {}
const chords = guitar.chords

for (const root of Object.keys(chords)) {
  const appRoot = ROOT_KEY_MAP[root] ?? root

  for (const chordDef of chords[root]) {
    // Slash chord suffixes (/B, /F#, /C#, …) are kept as-is; regular suffixes go through SUFFIX_MAP
    let appSuffix
    if (chordDef.suffix.startsWith('/')) {
      appSuffix = chordDef.suffix
    } else {
      appSuffix = SUFFIX_MAP[chordDef.suffix]
      if (appSuffix === undefined) continue
    }

    if (!chordDef.positions?.length) continue

    const chordName = `${appRoot}${appSuffix}`
    if (result[chordName]) continue

    const pos = chordDef.positions[0]
    result[chordName] = {
      frets:    pos.frets,
      fingers:  pos.fingers,
      baseFret: pos.baseFret,
      barres:   pos.barres ?? [],
    }
  }
}

// Manual voicings for slash chords not covered by @tombatossals/chords-db
const MANUAL_CHORDS = {
  // D over C# bass (library has D/F#, D/A, D/Bb, D/B, D/C but not D/C#)
  'D/C#': { frets: [-1, 4, 0, 2, 3, 2], fingers: [0, 4, 0, 1, 3, 2], baseFret: 1, barres: [] },
  // G over A bass
  'G/A':  { frets: [0, 0, 0, 0, 3, 3], fingers: [0, 0, 0, 0, 2, 3], baseFret: 1, barres: [] },
  // C over B bass
  'C/B':  { frets: [-1, 2, 2, 0, 1, 0], fingers: [0, 2, 3, 0, 1, 0], baseFret: 1, barres: [] },
  // Am over G bass
  'Am/G': { frets: [3, 0, 2, 2, 1, 0], fingers: [3, 0, 2, 3, 1, 0], baseFret: 1, barres: [] },
  // Am over E bass
  'Am/E': { frets: [0, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1, barres: [] },
  // Em over B bass
  'Em/B': { frets: [-1, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, barres: [] },
  // Em over D bass
  'Em/D': { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1, barres: [] },
  // Bm over A bass (open Am shape with B root not ideal; use barre at 2 with open A)
  'Bm/A': { frets: [-1, 0, 4, 4, 3, 2], fingers: [0, 0, 3, 4, 2, 1], baseFret: 1, barres: [] },
  // Bm over F# bass
  'Bm/F#': { frets: [2, 2, 4, 4, 3, 2], fingers: [1, 1, 3, 4, 2, 1], baseFret: 2, barres: [1] },
}

// Merge manual chords (do not overwrite library-sourced entries)
for (const [name, voicing] of Object.entries(MANUAL_CHORDS)) {
  if (!result[name]) result[name] = voicing
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/chords/chordFingerings.json')
writeFileSync(outPath, JSON.stringify(result, null, 2))
console.log(`Wrote ${Object.keys(result).length} chord voicings to ${outPath}`)
