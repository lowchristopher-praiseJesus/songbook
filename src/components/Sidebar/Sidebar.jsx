import { useState, useRef, useEffect } from 'react'
import { SignalIcon, MagnifyingGlassIcon, XMarkIcon, ArrowUpTrayIcon, RectangleStackIcon } from '@heroicons/react/24/outline'
import { useLibraryStore } from '../../store/libraryStore'
import { useFileImport } from '../../hooks/useFileImport'
import { SongListItem } from './SongListItem'
import { Button } from '../UI/Button'
import { Modal } from '../UI/Modal'
import { buildGroups } from '../../lib/collectionUtils'
import { UGSearchModal } from '../UGImport/UGSearchModal'
import { CollectionBrowseModal } from '../CommunityCollections/CollectionBrowseModal'
import { exportSongsAsSbp, safeFilename } from '../../lib/exportSbp'
import { loadSong, getTransposeState } from '../../lib/storage'
import { transposeChord } from '../../lib/parser/chordUtils'
import { ShareModal } from '../Share/ShareModal'
import { ExportBackgroundModal } from './ExportBackgroundModal'
import { ExportPresentationPptxModal } from './ExportPresentationPptxModal'
import { ExportPrintModal } from './ExportPrintModal'
import { AllSongsList } from './AllSongsList'
import { LiveSessionModal } from '../Session/LiveSessionModal'
import { BroadcastsPanel } from '../Conductor/BroadcastsPanel'
import { AlbumsPanel } from '../Album/AlbumsPanel'
import { AlbumCard } from '../Album/AlbumCard'
import { CollectionsPanel } from '../Collection/CollectionsPanel'
import { CollectionCard } from '../Collection/CollectionCard'

export function Sidebar({ isOpen, onAddToast, onSongSelect, onClose, onImportSuccess, onStartSession, onJoinSession, conductorSync, onNewAlbum, isAutoClosing = false }) {
  const [query, setQuery] = useState('')
  const [duplicateState, setDuplicateState] = useState(null)
  const [ugModalOpen, setUgModalOpen] = useState(false)
  const [collectionBrowseModalOpen, setCollectionBrowseModalOpen] = useState(false)
  const [filenameModalOpen, setFilenameModalOpen] = useState(false)
  const [filenameInput, setFilenameInput] = useState('')
  const [choiceModalOpen, setChoiceModalOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [backgroundModalOpen, setBackgroundModalOpen] = useState(false)
  const [pptxModalOpen, setPptxModalOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [liveSessionModalOpen, setLiveSessionModalOpen] = useState(false)
  const [pendingSongs, setPendingSongs] = useState([])
  const fileInputRef = useRef()
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const albums = useLibraryStore(s => s.albums)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleExportMode = useLibraryStore(s => s.toggleExportMode)
  const toggleGroupSelection = useLibraryStore(s => s.toggleGroupSelection)
  const viewMode = useLibraryStore(s => s.viewMode)
  const setViewMode = useLibraryStore(s => s.setViewMode)
  const setIsCreatingNewSong = useLibraryStore(s => s.setIsCreatingNewSong)
  const selectSong = useLibraryStore(s => s.selectSong)
  const setExpandedCollectionId = useLibraryStore(s => s.setExpandedCollectionId)
  const [exportSourceName, setExportSourceName] = useState(null)
  const [exportSourceCollectionId, setExportSourceCollectionId] = useState(null)
  // Clear tracked collection name when export mode is turned off
  useEffect(() => {
    if (!isExportMode) {
      setExportSourceName(null)
      setExportSourceCollectionId(null)
    }
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
  const filteredAlbums = trimmedQuery
    ? albums.filter(a =>
        a.title.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
        (a.artist ?? '').toLowerCase().includes(trimmedQuery.toLowerCase())
      )
    : []
  const filteredCollectionGroups = trimmedQuery
    ? buildGroups(index, collections.filter(c => c.name.toLowerCase().includes(trimmedQuery.toLowerCase())))
    : []

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

  function handleChoosePresentationPptx() {
    setChoiceModalOpen(false)
    const songs = [...selectedSongIds].map(id => loadSong(id)).filter(Boolean)
    setPendingSongs(songs)
    setPptxModalOpen(true)
  }

  function handlePptxModalClose() {
    setPptxModalOpen(false)
    toggleExportMode()
  }

  function handleChoosePrintPdf() {
    setChoiceModalOpen(false)
    const songs = loadSongsWithTranspose(selectedSongIds)
    setPendingSongs(songs)
    setPrintModalOpen(true)
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

      const blob = await exportSongsAsSbp(songs, collectionName, false, null, true)
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
        border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800
        absolute inset-y-0 left-0 z-40
        md:static md:z-auto
        transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}
      `}>
      {/* Search */}
      <div className="p-3 pb-0 border-b border-gray-100 dark:border-gray-800">
        <div className="relative mb-3">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder={viewMode === 'albums' ? 'Search albums...' : viewMode === 'collections' ? 'Search collections...' : 'Search songs...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* View mode toggle — hidden while search is active */}
        {!trimmedQuery && (
          <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5 mb-3">
            <button
              type="button"
              onClick={() => setViewMode('collections')}
              className={`flex-1 text-xs py-2 rounded-md transition-colors ${
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
              className={`flex-1 text-xs py-2 rounded-md transition-colors ${
                viewMode === 'allSongs'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              All Songs
            </button>
            <button
              type="button"
              onClick={() => setViewMode('albums')}
              className={`flex-1 text-xs py-2 rounded-md transition-colors ${
                viewMode === 'albums'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Albums
            </button>
          </div>
        )}
      </div>

      {/* Albums tab panel */}
      {viewMode === 'albums' && (
        trimmedQuery ? (
          <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
            {filteredAlbums.length > 0
              ? filteredAlbums.map(album => (
                  <AlbumCard key={album.albumCode} album={album} onSelect={onSongSelect} />
                ))
              : <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">No matches</li>
            }
          </ul>
        ) : (
          <AlbumsPanel onSelect={onSongSelect} onNewAlbum={onNewAlbum} />
        )
      )}

      {/* Song list */}
      {viewMode !== 'albums' && (
        viewMode === 'collections' && !trimmedQuery ? (
          <CollectionsPanel
            onSelect={onSongSelect}
            onClose={onClose}
            onGroupCheckboxChange={(val) => {
              if (val === null) {
                setExportSourceName(null)
                setExportSourceCollectionId(null)
              } else {
                setExportSourceName(val.name)
                setExportSourceCollectionId(val.id)
              }
            }}
          />
        ) : viewMode === 'allSongs' && !trimmedQuery ? (
          <>
            {/* New Song button stays fixed above the scrolling song list */}
            <div className="px-2 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => { setIsCreatingNewSong(true); onSongSelect?.() }}
                className="w-full flex items-center gap-1 px-2 py-2 text-xs
                  text-indigo-500 dark:text-indigo-400
                  border border-dashed border-gray-300 dark:border-gray-600 rounded
                  hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20
                  transition-colors"
              >
                + New Song
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
              {index.length > 0
                ? <AllSongsList entries={index} onSelect={onSongSelect} />
                : (
                  <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                    No songs yet
                  </li>
                )
              }
            </ul>
          </>
        ) : (
          <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
            {viewMode === 'collections' ? (
              <>
                {filteredCollectionGroups.map(group => (
                  <CollectionCard
                    key={group.id}
                    group={group}
                    onSelect={onSongSelect}
                    onGroupCheckboxChange={(val) => {
                      if (val === null) {
                        setExportSourceName(null)
                        setExportSourceCollectionId(null)
                      } else {
                        setExportSourceName(val.name)
                        setExportSourceCollectionId(val.id)
                      }
                    }}
                  />
                ))}
                {filteredCollectionGroups.length === 0 && (
                  <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                    No matches
                  </li>
                )}
              </>
            ) : (
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
            )}
          </ul>
        )
      )}

      <BroadcastsPanel conductorSync={conductorSync} onAddToast={onAddToast} />

      {/* Footer: normal mode → Import + Export; export mode → selection bar */}
      {(viewMode !== 'albums' || trimmedQuery) && <div className="p-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
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
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={toggleExportMode}
                aria-label="Export songs"
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                <span className="text-[10px] font-medium">Export</span>
              </button>
              <button
                type="button"
                onClick={() => setUgModalOpen(true)}
                aria-label="Search Ultimate Guitar"
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
                <span className="text-[10px] font-medium">Search Songs</span>
              </button>
              <button
                type="button"
                onClick={() => setCollectionBrowseModalOpen(true)}
                aria-label="Browse Communities"
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <RectangleStackIcon className="w-4 h-4" />
                <span className="text-[10px] font-medium">Browse Communities</span>
              </button>
              <button
                type="button"
                onClick={() => setLiveSessionModalOpen(true)}
                aria-label="Live Session"
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <SignalIcon className="w-4 h-4" />
                <span className="text-[10px] font-medium">Live</span>
              </button>
            </div>
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
      </div>}

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

      {isAutoClosing && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div data-testid="auto-close-bar" className="h-full bg-indigo-500 animate-drain" />
        </div>
      )}
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
          <Button variant="secondary" className="w-full" onClick={handleChoosePresentationPptx}>
            Presentation PPTX
          </Button>
          <Button variant="secondary" className="w-full" onClick={handleChoosePrintPdf}>
            Print PDF
          </Button>
        </div>
      </Modal>

      <ShareModal
        isOpen={shareModalOpen}
        songs={selectedSongs}
        collectionName={exportSourceName}
        collectionId={exportSourceCollectionId}
        onClose={() => { setShareModalOpen(false); toggleExportMode() }}
      />

      <ExportBackgroundModal
        isOpen={backgroundModalOpen}
        songs={pendingSongs}
        onClose={handleBackgroundModalClose}
        onAddToast={onAddToast}
      />

      <ExportPresentationPptxModal
        isOpen={pptxModalOpen}
        songs={pendingSongs}
        onClose={handlePptxModalClose}
        onAddToast={onAddToast}
      />

      <ExportPrintModal
        isOpen={printModalOpen}
        songs={pendingSongs}
        onClose={() => { setPrintModalOpen(false); toggleExportMode() }}
        onAddToast={onAddToast}
      />

      <UGSearchModal
        isOpen={ugModalOpen}
        onClose={() => setUgModalOpen(false)}
        onSongSelect={onSongSelect}
        onImportSuccess={onImportSuccess}
        onAddToast={onAddToast}
      />

      <CollectionBrowseModal
        isOpen={collectionBrowseModalOpen}
        onClose={() => setCollectionBrowseModalOpen(false)}
        onSongSelect={onSongSelect}
        onImportSuccess={onImportSuccess}
        onAddToast={onAddToast}
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
