import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { MetaFields } from './MetaFields'

export function SongEditor({ songId }) {
  const song = useLibraryStore(s => s.activeSong)
  const updateSong = useLibraryStore(s => s.updateSong)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)

  const [meta, setMeta] = useState(() => ({ ...song.meta }))
  const [rawText, setRawText] = useState(() => song.rawText ?? '')
  const [isDirty, setIsDirty] = useState(false)

  function handleMetaChange(field, value) {
    setMeta(m => ({ ...m, [field]: value }))
    setIsDirty(true)
  }

  function handleSave() {
    updateSong(songId, { meta, rawText })
    setEditingSongId(null)
  }

  function handleCancel() {
    if (isDirty && !window.confirm('Discard changes?')) return
    setEditingSongId(null)
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Sticky top bar */}
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-10">
        <h2 className="font-semibold truncate max-w-xs">{meta.title || 'Untitled'}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Save
          </button>
        </div>
      </div>

      {/* Metadata fields */}
      <MetaFields meta={meta} onChange={handleMetaChange} />

      {/* Content textarea */}
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4 min-h-0">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 select-none">
          {'{c: Section}'} for headers · [Chord] before a syllable
        </p>
        <textarea
          className="flex-1 w-full font-mono text-sm resize-none bg-transparent focus:outline-none leading-relaxed"
          value={rawText}
          onChange={e => { setRawText(e.target.value); setIsDirty(true) }}
          aria-label="Song content"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
