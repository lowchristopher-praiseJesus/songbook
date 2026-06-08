import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { MetaFields } from './MetaFields'
import { FixHeadersModal } from './FixHeadersModal'
import { parseContent } from '../../lib/parser/contentParser'
import { detectSectionHeaders, convertSectionHeaders } from '../../lib/parser/sectionDetector'

const KEY_TO_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}
const FLAT_KEY_NAMES = new Set(['Db', 'Eb', 'F', 'Ab', 'Bb'])

const DEFAULT_META = { title: '', artist: '', key: 'C', capo: 0 }

export function NewSongEditor() {
  const addSongs = useLibraryStore(s => s.addSongs)
  const selectSong = useLibraryStore(s => s.selectSong)
  const setIsCreatingNewSong = useLibraryStore(s => s.setIsCreatingNewSong)

  const [meta, setMeta] = useState({ ...DEFAULT_META })
  const [rawText, setRawText] = useState('')
  const [titleError, setTitleError] = useState(false)
  const [pendingFixes, setPendingFixes] = useState(null)

  function handleDetectHeaders() {
    const detections = detectSectionHeaders(rawText)
    if (detections.length > 0) setPendingFixes(detections)
  }

  function handleApplyFixes(selectedFixes) {
    setRawText(convertSectionHeaders(rawText, selectedFixes))
    setPendingFixes(null)
  }

  function handleMetaChange(field, value) {
    setMeta(m => ({ ...m, [field]: value }))
    if (field === 'title' && value.trim()) setTitleError(false)
  }

  function handleSave() {
    if (!meta.title.trim()) {
      setTitleError(true)
      return
    }

    const keyIndex = KEY_TO_INDEX[meta.key] ?? 0
    const usesFlats = FLAT_KEY_NAMES.has(meta.key)
    const sections = parseContent(rawText)

    const song = {
      rawText,
      meta: { ...meta, title: meta.title.trim(), keyIndex, usesFlats },
      sections,
    }

    const { newSongIds } = addSongs([song])
    if (newSongIds.length > 0) selectSong(newSongIds[0])
    setIsCreatingNewSong(false)
  }

  function handleCancel() {
    const hasContent = meta.title.trim() || rawText.trim()
    if (hasContent && !window.confirm('Discard new song?')) return
    setIsCreatingNewSong(false)
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Sticky top bar */}
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-10">
        <h2 className="font-semibold truncate max-w-xs">{meta.title.trim() || 'New Song'}</h2>
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
      <MetaFields meta={meta} onChange={handleMetaChange} titleError={titleError} titleRequired />

      {/* Content textarea */}
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4 min-h-0">
        <div className="flex items-start justify-between mb-1">
          <p className="text-xs text-gray-400 dark:text-gray-500 select-none">
            {'{c: Section}'} for headers · [Chord] before a syllable · {'{note: text}'} for annotations · [Chord]{'{strum: ///}'} for strum patterns
          </p>
          <button
            type="button"
            onClick={handleDetectHeaders}
            className="shrink-0 ml-3 text-xs px-2.5 py-1 rounded-md border border-indigo-300 dark:border-indigo-700
                       text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            Fix headers
          </button>
        </div>
        <textarea
          className="flex-1 w-full font-mono text-sm resize-none bg-transparent focus:outline-none leading-relaxed"
          value={rawText}
          onChange={e => setRawText(e.target.value)}
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
