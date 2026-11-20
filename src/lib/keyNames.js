// A song stores its key twice: meta.keyIndex (C-based 0–11, what the song header
// and transpose control display) and meta.key (a name, what the editor's Key field
// shows). keyIndex is the source of truth — every code path that changes it must
// keep the name in step, or the editor shows a different key than the header and
// Save (which derives keyIndex from the name) silently shifts the song's key.

export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const NAME_TO_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

const mod12 = i => ((i % 12) + 12) % 12

export function keyNameForIndex(keyIndex) {
  return KEY_NAMES[mod12(keyIndex)]
}

function indexForName(name) {
  if (typeof name !== 'string') return undefined
  const root = name.endsWith('m') ? name.slice(0, -1) : name
  return NAME_TO_INDEX[root]
}

/**
 * Return meta with meta.key consistent with meta.keyIndex. Returns the same
 * object when nothing needs changing (so an enharmonic spelling the user chose,
 * e.g. C# for index 1, is preserved).
 */
export function withSyncedKeyName(meta) {
  if (!meta || typeof meta.keyIndex !== 'number') return meta
  if (indexForName(meta.key) === mod12(meta.keyIndex)) return meta
  return { ...meta, key: keyNameForIndex(meta.keyIndex) }
}
