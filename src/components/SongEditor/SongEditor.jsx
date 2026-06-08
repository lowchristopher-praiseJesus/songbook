import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { MetaFields } from './MetaFields'
import { TransposeConfirmModal } from './TransposeConfirmModal'
import { FixHeadersModal } from './FixHeadersModal'
import { transposeRawTextByKey } from '../../lib/parser/chordUtils'
import { detectSectionHeaders, convertSectionHeaders } from '../../lib/parser/sectionDetector'

export function SongEditor({ songId }) {
  const song = useLibraryStore(s => s.activeSong)
  const updateSong = useLibraryStore(s => s.updateSong)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)

  const [meta, setMeta] = useState(() => song ? { ...song.meta } : {})
  const [rawText, setRawText] = useState(() => song?.rawText ?? '')
  const [isDirty, setIsDirty] = useState(false)
  const [pendingKeyChange, setPendingKeyChange] = useState(null)
  const [pendingFixes, setPendingFixes] = useState(null)

  function handleDetectHeaders() {
    const detections = detectSectionHeaders(rawText)
    if (detections.length > 0) setPendingFixes(detections)
  }

  function handleApplyFixes(selectedFixes) {
    setRawText(convertSectionHeaders(rawText, selectedFixes))
    setIsDirty(true)
    setPendingFixes(null)
  }

  if (!song) return null

  function handleMetaChange(field, value) {
    if (field === 'key' && value !== meta.key && rawText.includes('[')) {
      setPendingKeyChange({ fromKey: meta.key, toKey: value })
      return
    }
    setMeta(m => ({ ...m, [field]: value }))
    setIsDirty(true)
  }

  function handleTranspose() {
    const { fromKey, toKey } = pendingKeyChange
    setRawText(transposeRawTextByKey(rawText, fromKey, toKey))
    setMeta(m => ({ ...m, key: toKey }))
    setIsDirty(true)
    setPendingKeyChange(null)
  }

  function handleKeepAsIs() {
    setMeta(m => ({ ...m, key: pendingKeyChange.toKey }))
    setIsDirty(true)
    setPendingKeyChange(null)
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
      <TransposeConfirmModal
        isOpen={pendingKeyChange !== null}
        fromKey={pendingKeyChange?.fromKey ?? ''}
        toKey={pendingKeyChange?.toKey ?? ''}
        onTranspose={handleTranspose}
        onKeepAsIs={handleKeepAsIs}
      />

      {/* Content textarea */}
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4 min-h-0">
        <div className="flex items-start justify-between mb-1">
          <p className="text-xs text-gray-400 dark:text-gray-500 select-none">
            {'{c: Section}'} for headers · [Chord] before a syllable · {'{note: text}'} for annotations · [Chord]{'{strum: ///}'} for strum patterns
          </p>
          <button
            type="button"
            onClick={handleDetectHeaders}
            className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 shrink-0 ml-3 focus:outline-none"
          >
            Fix headers
          </button>
        </div>
        <textarea
          className="flex-1 w-full font-mono text-sm resize-none bg-transparent focus:outline-none leading-relaxed"
          value={rawText}
          onChange={e => { setRawText(e.target.value); setIsDirty(true) }}
          aria-label="Song content"
          spellCheck={false}
        />
      </div>
      <FixHeadersModal
        isOpen={pendingFixes !== null}
        detections={pendingFixes ?? []}
        onApply={handleApplyFixes}
        onCancel={() => setPendingFixes(null)}
      />
    </div>
  )
}
