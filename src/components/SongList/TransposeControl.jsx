const KEYS = [
  { label: 'Ab', index: 8 },
  { label: 'A',  index: 9 },
  { label: 'Bb', index: 10 },
  { label: 'B',  index: 11 },
  { label: 'C',  index: 0 },
  { label: 'Db', index: 1 },
  { label: 'D',  index: 2 },
  { label: 'Eb', index: 3 },
  { label: 'E',  index: 4 },
  { label: 'F',  index: 5 },
  { label: 'F#', index: 6 },
  { label: 'G',  index: 7 },
]

export function TransposeControl({ delta, onTransposeTo, originalKeyIndex }) {
  const currentKeyIndex = ((originalKeyIndex + delta) % 12 + 12) % 12

  function handleChange(e) {
    const targetIndex = Number(e.target.value)
    const raw = ((targetIndex - originalKeyIndex) % 12 + 12) % 12
    const newDelta = raw > 6 ? raw - 12 : raw
    onTransposeTo(newDelta)
  }

  return (
    <div aria-label="Transpose controls">
      <select
        value={currentKeyIndex}
        onChange={handleChange}
        aria-label="Select key"
        className="text-sm font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
      >
        {KEYS.map(({ label, index }) => (
          <option key={label} value={index}>{label}</option>
        ))}
      </select>
    </div>
  )
}
