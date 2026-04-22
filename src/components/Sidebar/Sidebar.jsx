import { useState, useRef, useEffect, Fragment } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useFileImport } from '../../hooks/useFileImport'
import { SongListItem } from './SongListItem'
import { CollectionGroup } from './CollectionGroup'
import { Button } from '../UI/Button'
import { Modal } from '../UI/Modal'
import { buildGroups } from '../../lib/collectionUtils'
import { UGSearchModal } from '../UGImport/UGSearchModal'
import { exportSongsAsSbp, safeFilename } from '../../lib/exportSbp'
import { loadSong, getTransposeState } from '../../lib/storage'
import { transposeChord } from '../../lib/parser/chordUtils'
import { ShareModal } from '../Share/ShareModal'
import { ExportBackgroundModal } from './ExportBackgroundModal'
import { AllSongsList } from './AllSongsList'
import { AddSongsModal } from './AddSongsModal'
import { LiveSessionModal } from '../Session/LiveSessionModal'

export function Sidebar({ isOpen, onAddToast, onSongSelect, onClose, onImportSuccess, onStartSession, onJoinSession }) {
  const [query, setQuery] = useState('')
  const [duplicateState, setDuplicateState] = useState(null)
  const [ugModalOpen, setUgModalOpen] = useState(false)
  const [filenameModalOpen, setFilenameModalOpen] = useState(false)
  const [filenameInput, setFilenameInput] = useState('')
  const [choiceModalOpen, setChoiceModalOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [backgroundModalOpen, setBackgroundModalOpen] = useState(false)
  const [liveSessionModalOpen, setLiveSessionModalOpen] = useState(false)
  const [pendingSongs, setPendingSongs] = useState([])
  const fileInputRef = useRef()
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleExportMode = useLibraryStore(s => s.toggleExportMode)
  const toggleGroupSelection = useLibraryStore(s => s.toggleGroupSelection)
  const viewMode = useLibraryStore(s => s.viewMode)
  const setViewMode = useLibraryStore(s => s.setViewMode)
  const createCollection = useLibraryStore(s => s.createCollection)
  const duplicateCollection = useLibraryStore(s => s.duplicateCollection)
  const selectSong = useLibraryStore(s => s.selectSong)
  const setExpandedCollectionId = useLibraryStore(s => s.setExpandedCollectionId)
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [collectionDraft, setCollectionDraft] = useState('')
  const [addSongsTarget, setAddSongsTarget] = useState(null) // { id, name } | null
  const [exportSourceName, setExportSourceName] = useState(null)
  const creatingEscapeRef = useRef(false)
  const [duplicatingCollectionId, setDuplicatingCollectionId] = useState(null)
  const [duplicateDraft, setDuplicateDraft] = useState('')
  const duplicatingEscapeRef = useRef(false)

  // Clear tracked collection name when export mode is turned off
  useEffect(() => {
    if (!isExportMode) setExportSourceName(null)
  }, [isExportMode])

  // Duplicate resolution: show inline modal, resolve via Promise
  function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  function resolveDuplicate(resolution) {
    const { resolve } = duplicateState
    setDuplicateState(null)
    resolve(resolution)
  }

  function confirmCreate() {
    if (collectionDraft.trim()) {
      createCollection(collectionDraft.trim())
    }
    setCreatingCollection(false)
    setCollectionDraft('')
  }

  function confirmDuplicate() {
    if (!duplicatingCollectionId) return
    if (duplicateDraft.trim()) {
      duplicateCollection(duplicatingCollectionId, duplicateDraft.trim())
    }
    setDuplicatingCollectionId(null)
    setDuplicateDraft('')
  }

  const { importFiles } = useFileImport({
    onError: msg => onAddToast(msg, 'error'),
    onDuplicateCheck,
    onSuccess: ({ newSongIds, collectionId } = {}) => {
      if (newSongIds?.length > 0) {
        if (collectionId) {
          setViewMode('collections')
          setExpandedCollectionId(collectionId)
        } else {
          setViewMode('allSongs')
        }
        selectSong(newSongIds[0])
      }
      onImportSuccess?.()
    },
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
    setFilenameInput(exportSourceName ?? `Songbook Export ${today}`)
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
    setPendingSongs(songs)
    setBackgroundModalOpen(true)
  }

  function handleBackgroundModalClose() {
    setBackgroundModalOpen(false)
    toggleExportMode()
  }

  function loadSongsWithTranspose(ids) {
    return [...ids].map(id => {
      const song = loadSong(id)
      if (!song) return null
      const ts = getTransposeState(id)
      const delta = ts?.delta ?? 0
      const capo = ts?.capo ?? song.meta.capo ?? 0
      const usesFlats = song.meta.usesFlats ?? false

      const newKeyIndex = (((song.meta.keyIndex ?? 0) + delta) % 12 + 12) % 12
      const rawText = delta === 0
        ? (song.rawText ?? '')
        : (song.rawText ?? '').replace(/\[([^\]]+)\]/g, (_, chord) =>
            '[' + transposeChord(chord, delta, usesFlats) + ']'
          )

      return {
        ...song,
        rawText,
        meta: {
          ...song.meta,
          keyIndex: newKeyIndex,
          key: ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'][newKeyIndex],
          capo,
        },
      }
    }).filter(Boolean)
  }

  async function handleExportConfirm() {
    const songs = loadSongsWithTranspose(selectedSongIds)

    try {
      const isSingle = songs.length === 1
      const collectionName = isSingle ? null : (filenameInput.trim() || 'Songbook Export')
      const filename = isSingle
        ? safeFilename(songs[0].meta?.title) + '.sbp'
        : safeFilename(collectionName) + '.sbp'

      const blob = await exportSongsAsSbp(songs, collectionName, false)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      onAddToast('Export failed: ' + err.message, 'error')
    }

    setFilenameModalOpen(false)
    toggleExportMode()
  }

  const selectedSongs = loadSongsWithTranspose(selectedSongIds)

  return (
    <>
      {/* Backdrop: mobile only — tap outside to close */}
      <div
        className={`absolute inset-0 z-30 md:hidden transition-opacity duration-200
          ${isOpen ? 'bg-black/40 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`
        w-[85vw] md:w-64 shrink-0 flex flex-col
        border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800
        absolute inset-y-0 left-0 z-40
        md:static md:z-auto
        transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}
      `}>
      {/* Search */}
      <div className="p-3 pb-0 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search songs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
        />
        {/* View mode toggle — hidden while search is active */}
        {!trimmedQuery && (
          <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5 mb-3">
            <button
              type="button"
              onClick={() => setViewMode('collections')}
              className={`flex-1 text-xs py-1 rounded-md transition-colors ${
                viewMode === 'collections'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Collections
            </button>
            <button
              type="button"
              onClick={() => setViewMode('allSongs')}
              className={`flex-1 text-xs py-1 rounded-md transition-colors ${
                viewMode === 'allSongs'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              All Songs
            </button>
          </div>
        )}
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
        ) : viewMode === 'allSongs' ? (
          <>
            {index.length > 0
              ? <AllSongsList entries={index} onSelect={onSongSelect} />
              : (
                <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                  No songs yet
                </li>
              )
            }
          </>
        ) : (
          <>
            {/* New Collection trigger */}
            <li>
              {creatingCollection ? (
                <div className="px-1 py-1">
                  <input
                    autoFocus
                    type="text"
                    value={collectionDraft}
                    onChange={e => setCollectionDraft(e.target.value)}
                    placeholder="Collection name…"
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmCreate() }
                      if (e.key === 'Escape') {
                        creatingEscapeRef.current = true
                        setCreatingCollection(false)
                        setCollectionDraft('')
                      }
                    }}
                    onBlur={() => {
                      if (creatingEscapeRef.current) { creatingEscapeRef.current = false; return }
                      confirmCreate()
                    }}
                    className="w-full px-2 py-1 text-[16px] rounded border border-indigo-400
                      bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                      outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                    Enter to create · Esc to cancel
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDuplicatingCollectionId(null)
                    setCreatingCollection(true)
                  }}
                  className="w-full flex items-center gap-1 px-2 py-1 text-xs
                    text-indigo-500 dark:text-indigo-400
                    border border-dashed border-gray-300 dark:border-gray-600 rounded
                    hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20
                    transition-colors"
                >
                  + New Collection
                </button>
              )}
            </li>
            {groups.map(group => (
              <Fragment key={group.id}>
                <CollectionGroup
                  group={group}
                  onSelect={onSongSelect}
                  onAddSongs={id => setAddSongsTarget({ id, name: group.name })}
                  onDuplicate={id => {
                    setCreatingCollection(false)
                    setDuplicatingCollectionId(id)
                    setDuplicateDraft('Copy of ' + group.name)
                  }}
                  onGroupCheckboxChange={setExportSourceName}
                />
                {duplicatingCollectionId === group.id && (
                  <li>
                    <div className="px-1 py-1">
                      <input
                        autoFocus
                        type="text"
                        value={duplicateDraft}
                        onChange={e => setDuplicateDraft(e.target.value)}
                        placeholder="Collection name…"
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); confirmDuplicate() }
                          if (e.key === 'Escape') {
                            duplicatingEscapeRef.current = true
                            setDuplicatingCollectionId(null)
                            setDuplicateDraft('')
                          }
                        }}
                        onBlur={() => {
                          if (duplicatingEscapeRef.current) { duplicatingEscapeRef.current = false; return }
                          confirmDuplicate()
                        }}
                        className="w-full px-2 py-1 text-[16px] rounded border border-indigo-400
                          bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                          outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                        Enter to confirm · Esc to cancel
                      </p>
                    </div>
                  </li>
                )}
              </Fragment>
            ))}
            {groups.length === 0 && !creatingCollection && (
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
            <div className="flex-1 flex flex-col">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {selectedSongIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => toggleGroupSelection(index.map(e => e.id))}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline text-left"
              >
                {index.length > 0 && index.every(e => selectedSongIds.has(e.id)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>
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
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setLiveSessionModalOpen(true)}
            >
              🎙 Live Session
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
        title="Export as SBP"
        onClose={() => setFilenameModalOpen(false)}
      >
        {selectedSongIds.size === 1 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            1 song will be downloaded as a .sbp file.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              {selectedSongIds.size} songs will be downloaded as a single .sbp file.
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
              placeholder="Filename (e.g. Easter Set)"
            />
          </>
        )}
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
            Download (.sbp)
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
        collectionName={exportSourceName}
        onClose={() => { setShareModalOpen(false); toggleExportMode() }}
      />

      <ExportBackgroundModal
        isOpen={backgroundModalOpen}
        songs={pendingSongs}
        onClose={handleBackgroundModalClose}
        onAddToast={onAddToast}
      />

      <UGSearchModal
        isOpen={ugModalOpen}
        onClose={() => setUgModalOpen(false)}
        onSongSelect={onSongSelect}
        onImportSuccess={onImportSuccess}
        onAddToast={onAddToast}
      />

      <AddSongsModal
        isOpen={!!addSongsTarget}
        collectionId={addSongsTarget?.id ?? null}
        collectionName={addSongsTarget?.name ?? ''}
        onClose={() => setAddSongsTarget(null)}
      />

      <LiveSessionModal
        isOpen={liveSessionModalOpen}
        onClose={() => setLiveSessionModalOpen(false)}
        onStartSession={onStartSession}
        onJoinSession={onJoinSession}
      />
    </>
  )
}
