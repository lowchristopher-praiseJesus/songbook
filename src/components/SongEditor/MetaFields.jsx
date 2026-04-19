const KEY_OPTIONS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const inputClass =
  'px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500'

export function MetaFields({ meta, onChange }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Title</span>
        <input
          type="text"
          value={meta.title ?? ''}
          onChange={e => onChange('title', e.target.value)}
          className={`w-48 ${inputClass}`}
          aria-label="Title"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Artist</span>
        <input
          type="text"
          value={meta.artist ?? ''}
          onChange={e => onChange('artist', e.target.value)}
          className={`w-40 ${inputClass}`}
          aria-label="Artist"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Key</span>
        <select
          value={meta.key ?? 'C'}
          onChange={e => onChange('key', e.target.value)}
          className={inputClass}
          aria-label="Key"
        >
          {KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Capo</span>
        <input
          type="number"
          min={0}
          max={7}
          value={meta.capo ?? 0}
          onChange={e => onChange('capo', Number(e.target.value))}
          className={`w-16 ${inputClass}`}
          aria-label="Capo"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Tempo</span>
        <input
          type="number"
          min={1}
          value={meta.tempo ?? ''}
          onChange={e => onChange('tempo', e.target.value ? Number(e.target.value) : undefined)}
          className={`w-20 ${inputClass}`}
          aria-label="Tempo"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time Sig</span>
        <input
          type="text"
          value={meta.timeSignature ?? ''}
          onChange={e => onChange('timeSignature', e.target.value || undefined)}
          className={`w-20 ${inputClass}`}
          aria-label="Time Signature"
          placeholder="4/4"
        />
      </label>

      <label className="flex flex-col gap-0.5 w-full">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Song Note</span>
        <input
          type="text"
          value={meta.annotation ?? ''}
          onChange={e => onChange('annotation', e.target.value || undefined)}
          className={`w-full ${inputClass}`}
          aria-label="Song Note"
          placeholder="e.g. sing in a happy mood"
        />
      </label>
    </div>
  )
}
