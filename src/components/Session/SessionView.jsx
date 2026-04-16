import React, { useState, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import {
  DndContext, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove,
  verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSessionStore } from '../../store/sessionStore'
import { useSessionSync } from '../../hooks/useSessionSync'
import { submitOp, acquireLock, releaseLock, closeSession } from '../../lib/sessionApi'
import { Button } from '../UI/Button'
import { Modal } from '../UI/Modal'
import { EditLockWarning } from './EditLockWarning'
import { useLibraryStore } from '../../store/libraryStore'
import { loadSong } from '../../lib/storage'
import { SongBody } from '../SongList/SongBody'
import { TransposeControl } from '../SongList/TransposeControl'
import { parseContent } from '../../lib/parser/contentParser'
import { useTranspose } from '../../hooks/useTranspose'

const KEY_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']

function SortableSessionSong({ songId, song, isLocked, isMyLock, onEdit, onRemove, onSelect, isSelected }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: songId })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const keyName = KEY_NAMES[song.meta.keyIndex] ?? ''

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm
        ${isDragging ? 'bg-indigo-50 dark:bg-indigo-900/20' : isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >&equiv;&equiv;</button>

      <button onClick={() => onSelect(songId)} className="flex-1 min-w-0 text-left">
        <p className={`font-medium truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {song.meta.title}
        </p>
        <p className="text-xs text-gray-500">{song.meta.artist || ''}{keyName ? ` \u00b7 Key of ${keyName}` : ''}</p>
      </button>

      {isLocked && !isMyLock ? (
        <span title="Someone is editing this song" className="text-base">🔒</span>
      ) : (
        <button
          onClick={() => onEdit(songId)}
          aria-label={`Edit ${song.meta.title}`}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
        >✏️</button>
      )}

      <button
        onClick={() => onRemove(songId)}
        aria-label={`Remove ${song.meta.title}`}
        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
      >&times;</button>
    </li>
  )
}

function SessionSongViewer({ song, onClose }) {
  const sections = useMemo(() => parseContent(song.rawText ?? ''), [song.rawText])
  const transpose = useTranspose(sections, song.meta.usesFlats ?? false, song.id, song.meta.capo ?? 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Viewer sub-header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 flex-wrap">
        <button
          onClick={onClose}
          className="md:hidden text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm shrink-0"
        >&larr;</button>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{song.meta.title}</p>
          {song.meta.artist && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.meta.artist}</p>
          )}
        </div>

        {/* Key dropdown */}
        <TransposeControl
          delta={transpose.delta}
          onTransposeTo={transpose.transposeTo}
          originalKeyIndex={song.meta.keyIndex}
          isMinor={song.meta.isMinor ?? false}
        />

        {/* Capo controls */}
        <div className="flex items-center gap-1" aria-label="Capo controls">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Capo</span>
          <button
            type="button"
            onClick={transpose.capoDown}
            disabled={transpose.capo === 0}
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Decrease capo"
          >&#8722;</button>
          <span className="w-4 text-center text-sm font-mono">{transpose.capo}</span>
          <button
            type="button"
            onClick={transpose.capoUp}
            disabled={transpose.capo === 7}
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Increase capo"
          >+</button>
        </div>
      </div>

      {/* Scrollable song body */}
      <div className="flex-1 overflow-y-auto p-4">
        <SongBody sections={transpose.transposedSections} fontSize={15} />
      </div>
    </div>
  )
}

export function SessionView({ code, leaderToken, onExit, onAddToast }) {
  const { name, setList, songs, editLocks, closed, expiresAt } = useSessionStore(
    useShallow(s => ({
      name: s.name, setList: s.setList, songs: s.songs,
      editLocks: s.editLocks, closed: s.closed, expiresAt: s.expiresAt,
    }))
  )
  const clientId = useSessionStore(s => s.clientId)
  const isLeader = useSessionStore(s => s.isLeader())
  const isLocked = useSessionStore(s => s.isLocked)
  const isMyLock = useSessionStore(s => s.isMyLock)
  const addSongs = useLibraryStore(s => s.addSongs)
  const libraryIndex = useLibraryStore(s => s.index)

  const [selectedSongId, setSelectedSongId] = useState(null)
  const [savedSongIds, setSavedSongIds] = useState(null) // null = never saved; Set = saved snapshot
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [addSongPickerOpen, setAddSongPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [lockWarning, setLockWarning] = useState(null)
  const [editingSongId, setEditingSongId] = useState(null)
  const [localEditText, setLocalEditText] = useState('')
  const [localMeta, setLocalMeta] = useState(null)
  const [ended, setEnded] = useState(false)
  const [copied, setCopied] = useState(false)

  const [memberLink] = useState(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('session', code)
    url.searchParams.delete('token')
    return url.toString()
  })

  const { startHeartbeat, stopHeartbeat } = useSessionSync({
    code,
    onEnded: useCallback(() => setEnded(true), []),
    onLockLost: useCallback(({ songId, hadConflict, theirRawText, localRawText }) => {
      setLockWarning({ songId, hadConflict, theirRawText, myRawText: localRawText })
    }, []),
  })

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = setList.indexOf(active.id)
    const newIndex = setList.indexOf(over.id)
    const reordered = arrayMove(setList, oldIndex, newIndex)
    const afterSongId = newIndex === 0 ? null : reordered[newIndex - 1]
    try {
      await submitOp(code, { type: 'move_song', songId: active.id, afterSongId })
    } catch {
      onAddToast?.('Could not reorder \u2014 please try again.', 'error')
    }
  }

  async function handleRemoveSong(songId) {
    if (selectedSongId === songId) setSelectedSongId(null)
    try {
      await submitOp(code, { type: 'remove_song', songId })
    } catch {
      onAddToast?.('Could not remove song \u2014 please try again.', 'error')
    }
  }

  async function handleEditSong(songId) {
    try {
      await acquireLock(code, songId, clientId)
      const song = songs[songId]
      const localRawText = song?.rawText ?? ''
      startHeartbeat(songId, clientId, localRawText)
      setLocalEditText(localRawText)
      setLocalMeta({
        title: song?.meta.title ?? '',
        artist: song?.meta.artist ?? '',
        keyIndex: song?.meta.keyIndex ?? 0,
        capo: song?.meta.capo ?? 0,
      })
      setEditingSongId(songId)
    } catch (err) {
      if (err.code === 'locked') {
        onAddToast?.('Someone else is editing this song.', 'error')
      } else {
        onAddToast?.('Could not acquire edit lock.', 'error')
      }
    }
  }

  async function handleSaveSong() {
    const songId = editingSongId
    const updatedSong = {
      ...songs[songId],
      meta: { ...songs[songId].meta, ...localMeta },
      rawText: localEditText,
    }
    setEditingSongId(null)
    setLocalMeta(null)
    try {
      await submitOp(code, { type: 'update_song', songId, song: updatedSong })
      await releaseLock(code, songId, clientId)
    } catch {
      onAddToast?.('Could not save song — please try again.', 'error')
    } finally {
      stopHeartbeat()
    }
  }

  async function handleCancelEdit() {
    const songId = editingSongId
    setEditingSongId(null)
    setLocalMeta(null)
    stopHeartbeat()
    await releaseLock(code, songId, clientId)
  }

  async function handleAddSongFromLibrary(songId) {
    const song = loadSong(songId)
    if (!song) return
    setAddSongPickerOpen(false)
    setPickerSearch('')
    try {
      await submitOp(code, { type: 'add_song', songId: song.id, song: { meta: song.meta, rawText: song.rawText ?? '' } })
    } catch {
      onAddToast?.('Could not add song \u2014 please try again.', 'error')
    }
  }

  function handleClose() {
    if (!leaderToken) return
    const allSaved = savedSongIds !== null && setList.every(id => savedSongIds.has(id))
    if (setList.length > 0 && !allSaved) {
      setCloseConfirmOpen(true)
    } else {
      handleEndSession()
    }
  }

  async function handleEndSession(saveFirst = false) {
    setCloseConfirmOpen(false)
    if (saveFirst) {
      const songsToAdd = setList
        .map(id => songs[id])
        .filter(Boolean)
        .map(s => ({ meta: s.meta, rawText: s.rawText, sections: [] }))
      if (songsToAdd.length > 0) {
        addSongs(songsToAdd, name || 'Live Session')
        setSavedSongIds(new Set(setList))
        onAddToast?.(`${songsToAdd.length} song${songsToAdd.length !== 1 ? 's' : ''} saved to your library.`, 'success')
      }
    }
    try {
      await closeSession(code, leaderToken)
      onExit()
    } catch {
      onAddToast?.('Could not close session.', 'error')
    }
  }

  function copyMemberLink() {
    navigator.clipboard.writeText(memberLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function saveAllToLibrary() {
    const songsToAdd = setList
      .map(id => songs[id])
      .filter(Boolean)
      .map(s => ({ meta: s.meta, rawText: s.rawText, sections: [] }))
    if (songsToAdd.length === 0) return
    addSongs(songsToAdd, name || 'Live Session')
    setSavedSongIds(new Set(setList))
    onAddToast?.(`${songsToAdd.length} song${songsToAdd.length !== 1 ? 's' : ''} saved to your library.`, 'success')
  }

  if (ended || closed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl">🎵</p>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">This session has ended</h2>
        <Button variant="primary" onClick={onExit}>Back to library</Button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onExit} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm shrink-0">&larr;</button>
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{name || 'Live Session'}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            Live
          </span>
          {expiresAt && (() => {
            const daysLeft = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000)
            const urgent = daysLeft <= 3
            const soon = daysLeft <= 7
            return (
              <span
                title={`Session data expires on ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                className={`hidden sm:inline text-xs px-1.5 py-0.5 rounded shrink-0
                  ${urgent ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 font-semibold'
                  : soon   ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                           : 'text-gray-400 dark:text-gray-500'}`}
              >
                Expires in {daysLeft}d
              </span>
            )
          })()}
        </div>
        {isLeader && (
          <button
            onClick={handleClose}
            title="End session"
            className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
          >
            End
          </button>
        )}
      </div>

      {/* Body: setlist panel + viewer panel */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left panel: set list + footer */}
        <div className={`flex flex-col border-r border-gray-200 dark:border-gray-700
          ${selectedSongId ? 'hidden md:flex md:w-72 md:shrink-0' : 'flex-1'}`}>

          {/* Set list */}
          <div className="flex-1 overflow-y-auto p-3">
            {setList.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">
                No songs yet — add some below
              </p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={setList} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-1">
                    {setList.map(songId => {
                      const song = songs[songId]
                      if (!song) return null
                      const locked = isLocked(songId)
                      const myLock = isMyLock(songId)
                      return (
                        <React.Fragment key={songId}>
                          <SortableSessionSong
                            songId={songId}
                            song={song}
                            isLocked={locked}
                            isMyLock={myLock}
                            onEdit={handleEditSong}
                            onRemove={handleRemoveSong}
                            onSelect={setSelectedSongId}
                            isSelected={selectedSongId === songId}
                          />
                          {locked && !myLock && (
                            <li className="text-xs text-amber-600 dark:text-amber-400 px-8 pb-1 list-none">
                              ⚠ Someone is editing this song
                            </li>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2 shrink-0">
            <Button variant="secondary" className="w-full" onClick={() => { setPickerSearch(''); setAddSongPickerOpen(true) }}>
              ➕ Add Song from My Library
            </Button>
            <Button variant="secondary" className="w-full" onClick={saveAllToLibrary}>
              💾 Save songs in session as a collection
            </Button>
            <Button variant="secondary" className="w-full" onClick={copyMemberLink}>
              {copied ? '✓ Link copied!' : '🔗 Copy member link'}
            </Button>
            <Button variant="ghost" className="w-full text-xs" onClick={onExit}>
              &darr; Exit session (go back to library)
            </Button>
          </div>
        </div>

        {/* Right panel: song viewer */}
        {selectedSongId && songs[selectedSongId] ? (
          <SessionSongViewer
            song={songs[selectedSongId]}
            onClose={() => setSelectedSongId(null)}
          />
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            Select a song to view its chords &amp; lyrics
          </div>
        )}

      </div>

      {/* End session confirmation */}
      {closeConfirmOpen && (
        <Modal isOpen title="End Live Session?" onClose={() => setCloseConfirmOpen(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This session has <span className="font-semibold">{setList.length} song{setList.length !== 1 ? 's' : ''}</span>.
              Would you like to save them to your library as a collection before ending?
            </p>
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
              Collection name: <span className="font-semibold">{name || 'Live Session'}</span>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="primary" className="w-full" onClick={() => handleEndSession(true)}>
                💾 Save as collection &amp; End session
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => handleEndSession(false)}>
                End without saving
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setCloseConfirmOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Song editor modal */}
      {editingSongId && songs[editingSongId] && localMeta && (
        <Modal isOpen title="Edit Song" onClose={handleCancelEdit}>
          <div className="flex flex-col gap-3">

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Song name</label>
              <input
                type="text"
                value={localMeta.title}
                onChange={e => setLocalMeta(m => ({ ...m, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            {/* Artist */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Singer / Artist</label>
              <input
                type="text"
                value={localMeta.artist}
                onChange={e => setLocalMeta(m => ({ ...m, artist: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Key + Capo */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Key</label>
                <select
                  value={localMeta.keyIndex}
                  onChange={e => setLocalMeta(m => ({ ...m, keyIndex: Number(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                    focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {KEY_NAMES.map((k, i) => (
                    <option key={i} value={i}>{k}</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Capo</label>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={localMeta.capo}
                  onChange={e => setLocalMeta(m => ({ ...m, capo: Math.min(12, Math.max(0, Number(e.target.value) || 0)) }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                    focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Lyrics / chords */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Lyrics &amp; chords &mdash; <span className="font-normal">{'{c: Section}'} for headers &middot; [Chord] before a syllable</span>
              </label>
              <textarea
                className="w-full h-48 font-mono text-sm resize-none border border-gray-200 dark:border-gray-700
                  rounded-lg p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={localEditText}
                onChange={e => setLocalEditText(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={handleCancelEdit}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveSong}>Save</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add song from library picker */}
      {addSongPickerOpen && (() => {
        const sessionSongIds = new Set(setList)
        const filtered = libraryIndex.filter(entry =>
          !sessionSongIds.has(entry.id) &&
          (pickerSearch === '' ||
            entry.title.toLowerCase().includes(pickerSearch.toLowerCase()) ||
            (entry.artist ?? '').toLowerCase().includes(pickerSearch.toLowerCase()))
        )
        return (
          <Modal isOpen title="Add Song from My Library" onClose={() => setAddSongPickerOpen(false)}>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search songs…"
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {filtered.length === 0 ? (
                <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">
                  {libraryIndex.length === 0 ? 'Your library is empty.' : 'No songs match.'}
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 -mx-1">
                  {filtered.map(entry => (
                    <li key={entry.id}>
                      <button
                        onClick={() => handleAddSongFromLibrary(entry.id)}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.title}</p>
                        {entry.artist && <p className="text-xs text-gray-500 dark:text-gray-400">{entry.artist}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => setAddSongPickerOpen(false)}>Cancel</Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Lock expiry warning dialog */}
      {lockWarning && (
        <EditLockWarning
          hadConflict={lockWarning.hadConflict}
          theirRawText={lockWarning.theirRawText}
          myRawText={lockWarning.myRawText}
          onRelock={async () => {
            const { songId, myRawText } = lockWarning
            setLockWarning(null)
            stopHeartbeat()
            try {
              await acquireLock(code, songId, clientId)
              const updatedSong = { ...songs[songId], rawText: myRawText }
              await submitOp(code, { type: 'update_song', songId, song: updatedSong })
              await releaseLock(code, songId, clientId)
              onAddToast?.('Song saved.', 'success')
            } catch {
              onAddToast?.('Could not save \u2014 please try again.', 'error')
            }
          }}
          onKeepTheirs={() => {
            setLockWarning(null)
            stopHeartbeat()
          }}
          onDiscard={() => {
            setLockWarning(null)
            stopHeartbeat()
          }}
        />
      )}
    </div>
  )
}
