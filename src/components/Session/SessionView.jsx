import React, { useState, useCallback } from 'react'
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
import { EditLockWarning } from './EditLockWarning'
import { useLibraryStore } from '../../store/libraryStore'

const KEY_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']

function SortableSessionSong({ songId, song, isLocked, isMyLock, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: songId })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const keyName = KEY_NAMES[song.meta.keyIndex] ?? ''

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm
        ${isDragging ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >&equiv;&equiv;</button>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{song.meta.title}</p>
        <p className="text-xs text-gray-500">{song.meta.artist || ''}{keyName ? ` \u00b7 Key of ${keyName}` : ''}</p>
      </div>

      {isLocked && !isMyLock ? (
        <span title="Someone is editing this song" className="text-base">\uD83D\uDD12</span>
      ) : (
        <button
          onClick={() => onEdit(songId)}
          aria-label={`Edit ${song.meta.title}`}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
        >\u270F\uFE0F</button>
      )}

      <button
        onClick={() => onRemove(songId)}
        aria-label={`Remove ${song.meta.title}`}
        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
      >&times;</button>
    </li>
  )
}

export function SessionView({ code, leaderToken, onExit, onAddToast }) {
  const { name, setList, songs, editLocks, closed } = useSessionStore(
    useShallow(s => ({
      name: s.name, setList: s.setList, songs: s.songs,
      editLocks: s.editLocks, closed: s.closed,
    }))
  )
  const clientId = useSessionStore(s => s.clientId)
  const isLeader = useSessionStore(s => s.isLeader())
  const isLocked = useSessionStore(s => s.isLocked)
  const isMyLock = useSessionStore(s => s.isMyLock)
  const addSongs = useLibraryStore(s => s.addSongs)

  const [lockWarning, setLockWarning] = useState(null)
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
    try {
      await submitOp(code, { type: 'remove_song', songId })
    } catch {
      onAddToast?.('Could not remove song \u2014 please try again.', 'error')
    }
  }

  async function handleEditSong(songId) {
    try {
      await acquireLock(code, songId, clientId)
      const localRawText = songs[songId]?.rawText ?? ''
      startHeartbeat(songId, clientId, localRawText)
    } catch (err) {
      if (err.code === 'locked') {
        onAddToast?.('Someone else is editing this song.', 'error')
      } else {
        onAddToast?.('Could not acquire edit lock.', 'error')
      }
    }
  }

  async function handleClose() {
    if (!leaderToken) return
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
    addSongs(songsToAdd)
    onAddToast?.(`${songsToAdd.length} song${songsToAdd.length !== 1 ? 's' : ''} saved to your library.`, 'success')
  }

  if (ended || closed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl">\uD83C\uDFB5</p>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">This session has ended</h2>
        <Button variant="primary" onClick={onExit}>Back to library</Button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button onClick={onExit} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">&larr;</button>
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{name || 'Live Session'}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            Live
          </span>
        </div>
        {isLeader && (
          <button
            onClick={handleClose}
            title="End session"
            className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            End
          </button>
        )}
      </div>

      {/* Set list */}
      <div className="flex-1 overflow-y-auto p-3">
        {setList.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">
            No songs yet \u2014 add some below
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
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <Button variant="secondary" className="w-full" onClick={saveAllToLibrary}>
          \uD83D\uDCBE Save all songs to My Library
        </Button>
        <Button variant="secondary" className="w-full" onClick={copyMemberLink}>
          {copied ? '\u2713 Link copied!' : '\uD83D\uDD17 Copy member link'}
        </Button>
        <Button variant="ghost" className="w-full text-xs" onClick={onExit}>
          &darr; Exit session (go back to library)
        </Button>
      </div>

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
