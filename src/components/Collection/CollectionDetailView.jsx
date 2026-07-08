import { useState, useRef, useEffect, useCallback } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLibraryStore } from '../../store/libraryStore'
import { AddSongsModal } from '../Sidebar/AddSongsModal'
import { UGSearchModal } from '../UGImport/UGSearchModal'
import { ConflictPickerModal } from '../Share/ConflictPickerModal'
import { checkShareVersion, fetchShare } from '../../lib/shareApi'
import { parseSbpFile } from '../../lib/parser/sbpParser'
import { mergeSharedCollection } from '../../lib/mergeSharedCollection'
import { loadSong } from '../../lib/storage'

function SortableSongRow({ entry, index: idx, onSongClick, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing touch-none shrink-0 select-none px-1"
        aria-label="Drag to reorder"
      >
        ⠿
      </span>
      <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums w-5 shrink-0 text-right select-none">
        {idx + 1}
      </span>
      <button
        type="button"
        onClick={() => onSongClick(entry.id)}
        className="flex-1 min-w-0 text-left"
      >
        <span className="block text-sm text-gray-800 dark:text-gray-200 truncate">{entry.title}</span>
        {entry.artist && (
          <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{entry.artist}</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        aria-label={`Remove ${entry.title} from collection`}
        className="shrink-0 p-1.5 rounded text-gray-300 dark:text-gray-600
          hover:text-red-500 dark:hover:text-red-400
          hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        ✕
      </button>
    </li>
  )
}

export function CollectionDetailView({ onAddToast, onOpenSidebar }) {
  const collectionId = useLibraryStore(s => s.selectedCollectionId)
  const collections = useLibraryStore(s => s.collections)
  const index = useLibraryStore(s => s.index)
  const setSelectedCollectionId = useLibraryStore(s => s.setSelectedCollectionId)
  const renameCollection = useLibraryStore(s => s.renameCollection)
  const deleteCollection = useLibraryStore(s => s.deleteCollection)
  const duplicateCollection = useLibraryStore(s => s.duplicateCollection)
  const setCollectionSongs = useLibraryStore(s => s.setCollectionSongs)
  const removeSongFromCollection = useLibraryStore(s => s.removeSongFromCollection)
  const applyShareRefresh = useLibraryStore(s => s.applyShareRefresh)
  const selectSong = useLibraryStore(s => s.selectSong)

  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateDraft, setDuplicateDraft] = useState('')
  const [addSongsOpen, setAddSongsOpen] = useState(false)
  const [ugModalOpen, setUgModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)
  const [pendingRefresh, setPendingRefresh] = useState(null)
  const renameInputRef = useRef(null)
  const duplicateInputRef = useRef(null)
  const renameEscapeRef = useRef(false)
  const duplicateEscapeRef = useRef(false)

  const isUncategorized = collectionId === '__uncategorized__'
  const collection = isUncategorized
    ? null
    : collections.find(c => c.id === collectionId)

  // Compute entries in collection order
  const byId = new Map(index.map(e => [e.id, e]))
  let entries
  if (isUncategorized) {
    const assignedIds = new Set(collections.flatMap(c => c.songIds))
    entries = index.filter(e => !assignedIds.has(e.id))
  } else {
    entries = (collection?.songIds ?? []).map(id => byId.get(id)).filter(Boolean)
  }

  const groupIds = entries.map(e => e.id)

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (renaming) {
      setRenameDraft(isUncategorized ? '' : (collection?.name ?? ''))
      renameInputRef.current?.select()
    }
  }, [renaming]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (duplicating) {
      setDuplicateDraft('Copy of ' + (collection?.name ?? ''))
      duplicateInputRef.current?.select()
    }
  }, [duplicating]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupIds.indexOf(active.id)
    const newIndex = groupIds.indexOf(over.id)
    setCollectionSongs(collectionId, arrayMove(groupIds, oldIndex, newIndex))
  }, [groupIds, collectionId, setCollectionSongs])

  function commitRename() {
    if (renameDraft.trim() && renameDraft.trim() !== collection?.name) {
      renameCollection(collectionId, renameDraft.trim())
    }
    setRenaming(false)
  }

  function commitDuplicate() {
    if (duplicateDraft.trim()) {
      const newId = duplicateCollection(collectionId, duplicateDraft.trim())
      if (newId) setSelectedCollectionId(newId)
    }
    setDuplicating(false)
    setDuplicateDraft('')
  }

  function handleDelete() {
    deleteCollection(collectionId)
    setSelectedCollectionId(null)
  }

  function handleSongClick(songId) {
    selectSong(songId, collectionId)
    setSelectedCollectionId(null)
  }

  const handleCheckUpdates = useCallback(async () => {
    if (!collection?.shareCode || refreshing) return
    setRefreshing(true)
    try {
      const { version } = await checkShareVersion(collection.shareCode)
      if (version < (collection.lastVersion ?? 1)) {
        onAddToast('Already up to date.', 'info')
        return
      }
      const buf = await fetchShare(collection.shareCode)
      const { songs: serverSongs } = await parseSbpFile(buf)
      const localSongs = collection.songIds.map(id => loadSong(id)).filter(Boolean)
      const mergeResult = mergeSharedCollection(collection, localSongs, serverSongs)

      if (mergeResult.conflicts.length === 0) {
        applyShareRefresh(collection.id, {
          patches: mergeResult.autoApplied,
          newSongs: mergeResult.newSongs,
          removed: mergeResult.removed,
          serverSbpIdOrder: mergeResult.serverSbpIdOrder,
          newVersion: version,
        })
        const changed = mergeResult.autoApplied.length
        const added = mergeResult.newSongs.length
        const removedCount = mergeResult.removed.length
        const parts = []
        if (changed) parts.push(`${changed} song${changed !== 1 ? 's' : ''} changed`)
        if (added) parts.push(`${added} added`)
        if (removedCount) parts.push(`${removedCount} removed`)
        onAddToast(parts.length ? `Updated — ${parts.join(', ')}` : 'Already up to date.', 'success')
      } else {
        setPendingRefresh({ ...mergeResult, newVersion: version })
      }
    } catch (err) {
      if (err.code === 'expired') {
        setLinkExpired(true)
        return
      }
      onAddToast('Could not check for updates. Please try again.', 'error')
    } finally {
      setRefreshing(false)
    }
  }, [collection, refreshing, onAddToast, applyShareRefresh])

  function handleConflictApply(resolvedPatches) {
    if (!pendingRefresh || !collection) return
    applyShareRefresh(collection.id, {
      patches: [...pendingRefresh.autoApplied, ...resolvedPatches],
      newSongs: pendingRefresh.newSongs,
      removed: pendingRefresh.removed,
      serverSbpIdOrder: pendingRefresh.serverSbpIdOrder,
      newVersion: pendingRefresh.newVersion,
    })
    setPendingRefresh(null)
    onAddToast('Updated — conflicts resolved.', 'success')
  }

  const collectionName = isUncategorized ? 'Uncategorized' : (collection?.name ?? '')

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => {
            setSelectedCollectionId(null)
            if (window.innerWidth < 768) onOpenSidebar?.()
          }}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          ← Back
        </button>

        {renaming ? (
          <div className="flex items-center gap-2">
            <input
              ref={renameInputRef}
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={() => {
                if (renameEscapeRef.current) { renameEscapeRef.current = false; return }
                commitRename()
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                if (e.key === 'Escape') { renameEscapeRef.current = true; setRenaming(false) }
              }}
              className="flex-1 min-w-0 text-2xl font-bold bg-transparent border-b-2 border-indigo-400
                text-gray-900 dark:text-gray-100 outline-none pb-1"
            />
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={commitRename}
              aria-label="Save"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full
                text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30
                transition-colors text-xl leading-none"
            >
              ✓
            </button>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { renameEscapeRef.current = true; setRenaming(false) }}
              aria-label="Cancel"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full
                text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700
                transition-colors text-xl leading-none"
            >
              ✕
            </button>
          </div>
        ) : (
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {collectionName}
          </h1>
        )}

        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          {entries.length} {entries.length === 1 ? 'song' : 'songs'}
        </p>
      </div>

      {/* Actions */}
      {!isUncategorized && (
        <div className="mb-8 space-y-2">
          <button
            type="button"
            onClick={() => setAddSongsOpen(true)}
            className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-300 text-sm font-medium
              hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Add Songs
          </button>

          <button
            type="button"
            onClick={() => setUgModalOpen(true)}
            className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-300 text-sm font-medium
              hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Search UG
          </button>

          {renaming ? null : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                text-gray-700 dark:text-gray-300 text-sm font-medium
                hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Rename
            </button>
          )}

          {duplicating ? (
            <div>
              <input
                ref={duplicateInputRef}
                value={duplicateDraft}
                onChange={e => setDuplicateDraft(e.target.value)}
                onBlur={() => {
                  if (duplicateEscapeRef.current) { duplicateEscapeRef.current = false; return }
                  commitDuplicate()
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitDuplicate() }
                  if (e.key === 'Escape') { duplicateEscapeRef.current = true; setDuplicating(false); setDuplicateDraft('') }
                }}
                placeholder="New collection name…"
                className="w-full px-3 py-2 text-[16px] rounded-lg border border-indigo-400
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                Enter to confirm · Esc to cancel
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDuplicating(true)}
              className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                text-gray-700 dark:text-gray-300 text-sm font-medium
                hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Duplicate
            </button>
          )}

          {collection?.shareCode && !linkExpired && (
            <button
              type="button"
              onClick={handleCheckUpdates}
              disabled={refreshing}
              className="w-full py-2.5 rounded-lg border border-indigo-300 dark:border-indigo-700
                text-indigo-600 dark:text-indigo-400 text-sm font-medium
                hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors
                disabled:opacity-50"
            >
              {refreshing ? 'Checking…' : 'Check for Updates'}
            </button>
          )}
          {collection?.shareCode && linkExpired && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-1">
              Share link expired
            </p>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full py-2.5 rounded-lg border border-red-300 dark:border-red-800
                  text-red-600 dark:text-red-400 text-sm font-medium
                  hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete Collection
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Remove "{collectionName}"? The {entries.length} song{entries.length !== 1 ? 's' : ''} will remain in your library.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white
                      hover:bg-red-700 transition-colors"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                      text-gray-600 dark:text-gray-400
                      hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isUncategorized && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          These songs aren't in any collection.
        </p>
      )}

      {/* Song list */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          {entries.length} {entries.length === 1 ? 'Song' : 'Songs'}
        </h2>
        {entries.length > 0 ? (
          isUncategorized ? (
            <ol className="space-y-0">
              {entries.map((entry, idx) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
                >
                  <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums w-5 shrink-0 text-right">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSongClick(entry.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className="block text-sm text-gray-800 dark:text-gray-200 truncate">{entry.title}</span>
                    {entry.artist && (
                      <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{entry.artist}</span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                <ol className="space-y-0">
                  {entries.map((entry, idx) => (
                    <SortableSongRow
                      key={entry.id}
                      entry={entry}
                      index={idx}
                      onSongClick={handleSongClick}
                      onRemove={id => removeSongFromCollection(id, collectionId)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4">
            No songs yet. Use "Add Songs" to populate this collection.
          </p>
        )}
      </div>

      <AddSongsModal
        isOpen={addSongsOpen}
        collectionId={collectionId}
        collectionName={collectionName}
        onClose={() => setAddSongsOpen(false)}
      />

      <UGSearchModal
        isOpen={ugModalOpen}
        onClose={() => setUgModalOpen(false)}
        collectionId={collectionId}
        onAddToast={onAddToast}
        onSongSelect={() => {
          setSelectedCollectionId(null)
          if (window.innerWidth < 768) onOpenSidebar?.()
        }}
      />

      {pendingRefresh && (
        <ConflictPickerModal
          conflicts={pendingRefresh.conflicts}
          onApply={handleConflictApply}
          onCancel={() => setPendingRefresh(null)}
        />
      )}
    </div>
  )
}
