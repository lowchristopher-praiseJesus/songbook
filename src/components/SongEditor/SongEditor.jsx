import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { MetaFields } from './MetaFields'
import { TransposeConfirmModal } from './TransposeConfirmModal'
import { FixHeadersModal } from './FixHeadersModal'
import { FixChordsModal } from './FixChordsModal'
import { transposeRawTextByKey } from '../../lib/parser/chordUtils'
import { detectSectionHeaders, convertSectionHeaders } from '../../lib/parser/sectionDetector'
import { detectChordFixes, applyChordFixes } from '../../lib/parser/chordLineDetector'
import { checkKey } from '../../lib/parser/keyChecker'
import { KeyCheckModal } from './KeyCheckModal'

export function SongEditor({ songId, onAddToast }) {
  const song = useLibraryStore(s => s.activeSong)
  const updateSong = useLibraryStore(s => s.updateSong)
  const saveAsNewSong = useLibraryStore(s => s.saveAsNewSong)
  const selectSong = useLibraryStore(s => s.selectSong)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)

  const [meta, setMeta] = useState(() => song ? { ...song.meta } : {})
  const [rawText, setRawText] = useState(() => song?.rawText ?? '')
  const [isDirty, setIsDirty] = useState(false)
  const [pendingKeyChange, setPendingKeyChange] = useState(null)
  const [pendingFixes, setPendingFixes] = useState(null)
  const [pendingChordFixes, setPendingChordFixes] = useState(null)
  const [pendingKeyCheck, setPendingKeyCheck] = useState(null)

  function handleDetectHeaders() {
    const detections = detectSectionHeaders(rawText)
    if (detections.length > 0) setPendingFixes(detections)
    else onAddToast?.('No section headers to fix.', 'info')
  }

  function handleApplyFixes(selectedFixes) {
    setRawText(convertSectionHeaders(rawText, selectedFixes))
    setIsDirty(true)
    setPendingFixes(null)
  }

  function handleDetectChords() {
    const detections = detectChordFixes(rawText)
    if (detections.length > 0) setPendingChordFixes(detections)
    else onAddToast?.('No chord lines to fix.', 'info')
  }

  function handleApplyChordFixes(selectedFixes) {
    setRawText(applyChordFixes(rawText, selectedFixes))
    setIsDirty(true)
    setPendingChordFixes(null)
  }

  function handleCheckKey() {
    const result = checkKey(rawText, meta.key)
    if (result.totalChords === 0) {
      onAddToast?.('No chords found to analyze.', 'info')
      return
    }
    if (result.keyMatches && result.outlierChords.length === 0) {
      onAddToast?.('Key looks correct — no issues found.', 'success')
      return
    }
    setPendingKeyCheck(result)
  }

  function handleUpdateKeyFromCheck(newKey) {
    setPendingKeyCheck(null)
    handleMetaChange('key', newKey)
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

  function handleSaveAs() {
    const newId = saveAsNewSong(songId, { meta, rawText })
    if (newId) selectSong(newId)
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
            onClick={handleSaveAs}
            className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Save as a new song, keeping the original unchanged"
          >
            Save As
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
            className="shrink-0 ml-3 text-xs px-2.5 py-1 rounded-md border border-indigo-300 dark:border-indigo-700
                       text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            Fix headers
          </button>
          <button
            type="button"
            onClick={handleDetectChords}
            className="shrink-0 ml-2 text-xs px-2.5 py-1 rounded-md border border-indigo-300 dark:border-indigo-700
                       text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            Fix chords
          </button>
          <button
            type="button"
            onClick={handleCheckKey}
            className="shrink-0 ml-2 text-xs px-2.5 py-1 rounded-md border border-indigo-300 dark:border-indigo-700
                       text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            Check key
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
      <FixChordsModal
        isOpen={pendingChordFixes !== null}
        detections={pendingChordFixes ?? []}
        onApply={handleApplyChordFixes}
        onCancel={() => setPendingChordFixes(null)}
      />
      <KeyCheckModal
        isOpen={pendingKeyCheck !== null}
        result={pendingKeyCheck}
        onUpdateKey={handleUpdateKeyFromCheck}
        onCancel={() => setPendingKeyCheck(null)}
      />
    </div>
  )
}
