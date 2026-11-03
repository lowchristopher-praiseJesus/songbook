const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']

// Prefer keyIndex + transpose delta so the label matches the key actually being played
// (same names as the TransposeControl dropdown). Some import paths (community
// collections/arrangements) store only keyIndex, never meta.key; songKey is the
// fallback for songs with no keyIndex.
function resolveKey(songKey, keyIndex, isMinor, delta) {
  if (typeof keyIndex !== 'number') return songKey || null
  const i = (((keyIndex + delta) % 12) + 12) % 12
  return (isMinor ? MINOR_NAMES : MAJOR_NAMES)[i]
}

export function SongTitleBlock({ title, songKey, keyIndex, isMinor, delta = 0, tempo }) {
  const key = resolveKey(songKey, keyIndex, isMinor, delta)
  // tempo can be 0 from some imports; coerce so React doesn't render a literal "0".
  const hasTempo = Number(tempo) > 0
  return (
    <div className="mb-4">
      <h1
        className="font-bold leading-tight"
        style={{ fontFamily: 'var(--title-font)', fontSize: 'var(--title-size)', color: 'var(--title-color-active)' }}
      >{title}</h1>
      {(key || hasTempo) && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {key && <span>Key: {key}</span>}
          {key && hasTempo && <span className="mx-1.5">·</span>}
          {hasTempo && <span>BPM: {tempo}</span>}
        </p>
      )}
    </div>
  )
}
