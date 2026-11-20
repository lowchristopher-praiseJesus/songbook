import { useState } from 'react'

const KEY_OPTIONS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const inputClass =
  'px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500'

const labelClass = 'text-xs font-medium text-gray-500 dark:text-gray-400'

function summaryParts(meta) {
  const parts = []
  if (meta.key) parts.push(`Key ${meta.key}`)
  if (meta.capo) parts.push(`Capo ${meta.capo}`)
  if (meta.tempo) parts.push(`${meta.tempo} BPM`)
  if (meta.timeSignature) parts.push(meta.timeSignature)
  return parts
}

/**
 * Song metadata form.
 *
 * On phones it can collapse to a one-tap summary line so the lyrics textarea
 * gets the screen; when open it uses a compact 4-column grid. From `md` up the
 * summary is hidden and the fields always show in a single wrapping row.
 */
export function MetaFields({ meta, onChange, titleError = false, titleRequired = false, defaultCollapsed = false }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  const isOpen = open || titleError

  const title = meta.title?.trim() || 'Untitled'
  const artist = meta.artist?.trim()
  const details = summaryParts(meta)

  return (
    <div className="px-4 py-2 md:py-3 border-b border-gray-200 dark:border-gray-700">
      {/* Mobile summary / toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={isOpen}
        aria-controls="song-meta-fields"
        className="md:hidden w-full flex items-center gap-3 text-left rounded
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {title}{artist && <span className="font-normal text-gray-500 dark:text-gray-400"> · {artist}</span>}
          </span>
          {details.length > 0 && (
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{details.join(' · ')}</span>
          )}
        </span>
        <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-indigo-600 dark:text-indigo-400">
          {isOpen ? 'Hide' : 'Edit'}
          <span aria-hidden="true" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>

      <div
        id="song-meta-fields"
        className={`${isOpen ? 'grid' : 'hidden'} grid-cols-4 gap-x-2 gap-y-1.5 mt-2
                    md:mt-0 md:flex md:flex-wrap md:gap-x-4 md:gap-y-2`}
      >
        <label className="col-span-2 flex flex-col gap-0.5 min-w-0">
          <span className={labelClass}>
            Title {titleRequired && <span className="text-red-500">*</span>}
          </span>
          <input
            type="text"
            value={meta.title ?? ''}
            onChange={e => onChange('title', e.target.value)}
            className={`w-full md:w-48 ${inputClass} ${titleError ? 'border-red-500 focus:ring-red-500' : ''}`}
            aria-label="Title"
          />
          {titleError && (
            <span className="text-xs text-red-500">Title is required</span>
          )}
        </label>

        <label className="col-span-2 flex flex-col gap-0.5 min-w-0">
          <span className={labelClass}>Artist</span>
          <input
            type="text"
            value={meta.artist ?? ''}
            onChange={e => onChange('artist', e.target.value)}
            className={`w-full md:w-40 ${inputClass}`}
            aria-label="Artist"
          />
        </label>

        <label className="flex flex-col gap-0.5 min-w-0">
          <span className={labelClass}>Key</span>
          <select
            value={meta.key ?? 'C'}
            onChange={e => onChange('key', e.target.value)}
            className={`w-full md:w-auto ${inputClass}`}
            aria-label="Key"
          >
            {KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-0.5 min-w-0">
          <span className={labelClass}>Capo</span>
          <input
            type="number"
            min={0}
            max={7}
            value={meta.capo ?? 0}
            onChange={e => onChange('capo', Number(e.target.value))}
            className={`w-full md:w-16 ${inputClass}`}
            aria-label="Capo"
          />
        </label>

        <label className="flex flex-col gap-0.5 min-w-0">
          <span className={labelClass}>Tempo</span>
          <input
            type="number"
            min={1}
            value={meta.tempo ?? ''}
            onChange={e => onChange('tempo', e.target.value ? Number(e.target.value) : undefined)}
            className={`w-full md:w-20 ${inputClass}`}
            aria-label="Tempo"
          />
        </label>

        <label className="flex flex-col gap-0.5 min-w-0">
          <span className={labelClass}>Time Sig</span>
          <input
            type="text"
            value={meta.timeSignature ?? ''}
            onChange={e => onChange('timeSignature', e.target.value || undefined)}
            className={`w-full md:w-20 ${inputClass}`}
            aria-label="Time Signature"
            placeholder="4/4"
          />
        </label>

        <label className="col-span-4 flex flex-col gap-0.5 md:w-full">
          <span className={labelClass}>Song Note</span>
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
    </div>
  )
}
