import { useState, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useFileImport } from '../../hooks/useFileImport'
import { SongListItem } from './SongListItem'
import { CollectionGroup } from './CollectionGroup'
import { Button } from '../UI/Button'
import { Modal } from '../UI/Modal'
import { buildGroups } from '../../lib/collectionUtils'
import { UGSearchModal } from '../UGImport/UGSearchModal'
import { exportSongsAsSbp } from '../../lib/exportSbp'
import { loadSong } from '../../lib/storage'
import { ShareModal } from '../Share/ShareModal'
import { exportPresentationPdf } from '../../lib/exportPresentationPdf'

export function Sidebar({ isOpen, onAddToast, onSongSelect, onClose, onImportSuccess }) {
  const [query, setQuery] = useState('')
  const [duplicateState, setDuplicateState] = useState(null)
  const [ugModalOpen, setUgModalOpen] = useState(false)
  const [filenameModalOpen, setFilenameModalOpen] = useState(false)
  const [filenameInput, setFilenameInput] = useState('')
  const [choiceModalOpen, setChoiceModalOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const fileInputRef = useRef()
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleExportMode = useLibraryStore(s => s.toggleExportMode)

  // Duplicate resolution: show inline modal, resolve via Promise
  function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  function resolveDuplicate(resolution) {
    const { resolve } = duplicateState
    setDuplicateState(null)
    resolve(resolution)
  }

  const { importFiles } = useFileImport({
    onError: msg => onAddToast(msg, 'error'),
    onDuplicateCheck,
    onSuccess: onImportSuccess,
  })

  const trimmedQuery = query.trim()
  const filtered = trimmedQuery
    ? index.filter(e =>
        e.title.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
        (e.artist ?? '').toLowerCase().includes(trimmedQuery.toLowerCase())
      )
    : []

  const groups = !trimmedQuery ? buildGroups(index, collections) : []

  function handleFileInput(e) {
    importFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  function openFilenameModal() {
    const today = new Date().toISOString().slice(0, 10)
    setFilenameInput(`Songbook Export ${today}`)
    setFilenameModalOpen(true)
  }

  function openChoiceModal() {
    setChoiceModalOpen(true)
  }

  function handleChooseDownload() {
    setChoiceModalOpen(false)
    openFilenameModal()
  }

  function handleChooseShare() {
    setChoiceModalOpen(false)
    setShareModalOpen(true)
  }

  function handleChoosePresentationPdf() {
    setChoiceModalOpen(false)
    const songs = [...selectedSongIds].map(id => loadSong(id)).filter(Boolean)
    try {
      exportPresentationPdf(songs)
    } catch (err) {
      onAddToast('PDF export failed: ' + err.message, 'error')
    }
    toggleExportMode()
  }

  async function handleExportConfirm() {
    const songs = [...selectedSongIds].map(id => loadSong(id)).filter(Boolean)
    let name = filenameInput.trim() || 'Songbook Export'
    if (!name.endsWith('.sbp')) name += '.sbp'

    try {
      const blob = await exportSongsAsSbp(songs)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      onAddToast('Export failed: ' + err.message, 'error')
    }

    setFilenameModalOpen(false)
    toggleExportMode()
  }

  const selectedSongs = [...selectedSongIds].map(id => loadSong(id)).filter(Boolean)

  return (
    <>
      {/* Backdrop: mobile only — tap outside to close */}
      <div
        className={`absolute inset-0 z-30 md:hidden transition-opacity duration-200
          ${isOpen ? 'bg-black/40 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`
        w-64 shrink-0 flex flex-col
        border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800
        absolute inset-y-0 left-0 z-40
        md:static md:z-auto
        transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}
      `}>
      {/* Search */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search songs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Song list */}
      <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
        {trimmedQuery ? (
          <>
            {filtered.map(entry => (
              <SongListItem key={entry.id} entry={entry} onSelect={onSongSelect} />
            ))}
            {filtered.length === 0 && (
              <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                No matches
              </li>
            )}
          </>
        ) : (
          <>
            {groups.map(group => (
              <CollectionGroup key={group.id} group={group} onSelect={onSongSelect} />
            ))}
            {groups.length === 0 && (
              <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                No songs yet
              </li>
            )}
          </>
        )}
      </ul>

      {/* Footer: normal mode → Import + Export; export mode → selection bar */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {isExportMode ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-600 dark:text-gray-300">
              {selectedSongIds.size} selected
            </span>
            <Button
              variant="primary"
              disabled={selectedSongIds.size === 0}
              onClick={openChoiceModal}
            >
              Export
            </Button>
            <Button variant="ghost" onClick={toggleExportMode}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              + Import
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={toggleExportMode}
              aria-label="Export songs"
            >
              Export
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setUgModalOpen(true)}
            >
              Search UG
            </Button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=""
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Duplicate resolution modal */}
      <Modal
        isOpen={!!duplicateState}
        title="Duplicate Song"
        onClose={() => resolveDuplicate('skip')}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          A song titled "{duplicateState?.title}" already exists. What would you like to do?
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="danger" onClick={() => resolveDuplicate('replace')}>Replace</Button>
          <Button variant="secondary" onClick={() => resolveDuplicate('keep-both')}>Keep Both</Button>
          <Button variant="ghost" onClick={() => resolveDuplicate('skip')}>Skip</Button>
        </div>
      </Modal>
    </aside>

      {/* Filename modal */}
      <Modal
        isOpen={filenameModalOpen}
        title="Export as .sbp"
        onClose={() => setFilenameModalOpen(false)}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {selectedSongIds.size} song{selectedSongIds.size !== 1 ? 's' : ''} will be exported.
        </p>
        <input
          type="text"
          value={filenameInput}
          onChange={e => setFilenameInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleExportConfirm() }}
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          placeholder="Filename"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setFilenameModalOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleExportConfirm}>Download</Button>
        </div>
      </Modal>

      <Modal
        isOpen={choiceModalOpen}
        title={`Export ${selectedSongIds.size} song${selectedSongIds.size !== 1 ? 's' : ''}`}
        onClose={() => setChoiceModalOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <Button variant="secondary" className="w-full" onClick={handleChooseDownload}>
            Download .sbp
          </Button>
          <Button variant="secondary" className="w-full" onClick={handleChooseShare}>
            Share via link
          </Button>
          <Button variant="secondary" className="w-full" onClick={handleChoosePresentationPdf}>
            Presentation PDF
          </Button>
        </div>
      </Modal>

      <ShareModal
        isOpen={shareModalOpen}
        songs={selectedSongs}
        onClose={() => { setShareModalOpen(false); toggleExportMode() }}
      />

      <UGSearchModal
        isOpen={ugModalOpen}
        onClose={() => setUgModalOpen(false)}
        onSongSelect={onSongSelect}
        onImportSuccess={onImportSuccess}
        onAddToast={onAddToast}
      />
    </>
  )
}
