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
import { SongListItem } from './SongListItem'
import { checkShareVersion, fetchShare } from '../../lib/shareApi'
import { parseSbpFile } from '../../lib/parser/sbpParser'
import { mergeSharedCollection } from '../../lib/mergeSharedCollection'
import { loadSong } from '../../lib/storage'
import { ConflictPickerModal } from '../Share/ConflictPickerModal'

function SortableSongListItem({ entry, onSelect, collectionId }) {
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
  }

  return (
    <SongListItem
      entry={entry}
      onSelect={onSelect}
      collectionId={collectionId}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleListeners={listeners}
      dragHandleAttributes={attributes}
      isDragging={isDragging}
    />
  )
}

export function CollectionGroup({ group, onSelect, onAddSongs = () => {}, onDuplicate = () => {}, onGroupCheckboxChange = () => {}, onAddToast = () => {} }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(group.name)
  const inputRef = useRef(null)
  const checkboxRef = useRef(null)
  const deleteCollection = useLibraryStore(s => s.deleteCollection)
  const renameCollection = useLibraryStore(s => s.renameCollection)
  const setCollectionSongs = useLibraryStore(s => s.setCollectionSongs)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleGroupSelection = useLibraryStore(s => s.toggleGroupSelection)
  const expandedCollectionId = useLibraryStore(s => s.expandedCollectionId)
  const [linkExpired, setLinkExpired] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingRefresh, setPendingRefresh] = useState(null)
  const collection = useLibraryStore(s => s.collections.find(c => c.id === group.id))
  const applyShareRefresh = useLibraryStore(s => s.applyShareRefresh)

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (editing) {
      setDraft(group.name)
      inputRef.current?.select()
    }
  }, [editing, group.name])

  const groupIds = group.entries.map(e => e.id)
  const selectedCount = groupIds.filter(id => selectedSongIds.has(id)).length
  const allSelected = groupIds.length > 0 && selectedCount === groupIds.length
  const someSelected = selectedCount > 0 && !allSelected

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  useEffect(() => {
    if (expandedCollectionId === group.id) setOpen(true)
  }, [expandedCollectionId, group.id])

  function handleDelete(e) {
    e.stopPropagation()
    if (window.confirm(`Remove collection "${group.name}"? The ${group.entries.length} song${group.entries.length !== 1 ? 's' : ''} will remain in your library.`)) {
      deleteCollection(group.id)
    }
  }

  function handleEditClick(e) {
    e.stopPropagation()
    setEditing(true)
  }

  function commitRename() {
    if (draft.trim() && draft.trim() !== group.name) {
      renameCollection(group.id, draft.trim())
    }
    setEditing(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setEditing(false) }
  }

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupIds.indexOf(active.id)
    const newIndex = groupIds.indexOf(over.id)
    setCollectionSongs(group.id, arrayMove(groupIds, oldIndex, newIndex))
  }, [groupIds, group.id, setCollectionSongs])

  const handleCheckUpdates = useCallback(async (e) => {
    e.stopPropagation()
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

      // TEMP DIAGNOSTIC — remove after debugging share-refresh inconsistency
      console.log('[ShareRefresh:merge] ' + JSON.stringify({
        serverVersion: version,
        localVersion: collection.lastVersion ?? 1,
        server: serverSongs.map(s => ({ sbpId: s.meta.sbpId, t: s.meta.title })),
        localCollection: localSongs.map(s => ({ id: String(s.id).slice(0, 8), sbpId: s.meta.sbpId, t: s.meta.title, base: !!s.meta.sharedBaseline })),
        newSongs: mergeResult.newSongs.map(s => ({ sbpId: s.meta.sbpId, t: s.meta.title })),
        removed: mergeResult.removed.map(id => String(id).slice(0, 8)),
        autoApplied: mergeResult.autoApplied.length,
        conflicts: mergeResult.conflicts.length,
        fullLibrarySize: useLibraryStore.getState().index.length,
      }))

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

  const isSpecial = group.id === '__uncategorized__'

  return (
    <li>
      <div className="flex items-center group">
        {isExportMode && (
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              onGroupCheckboxChange(allSelected ? null : { name: group.name, id: group.id })
              toggleGroupSelection(groupIds)
            }}
            onClick={e => e.stopPropagation()}
            className="ml-2 mr-1 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
        )}
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold uppercase tracking-wide
              text-gray-700 dark:text-gray-200
              bg-white dark:bg-gray-800 border border-indigo-400 rounded outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex-1 min-w-0 flex items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide
              text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>›</span>
            <span className="flex-1 text-left line-clamp-2">{group.name}</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-normal">
              {group.entries.length}
            </span>
          </button>
        )}
        {!editing && !isExportMode && (
          <>
            {!isSpecial && (
              <button
                type="button"
                title={`Add songs to ${group.name}`}
                onClick={e => { e.stopPropagation(); onAddSongs(group.id) }}
                aria-label={`Add songs to ${group.name}`}
                className="ml-1 p-1 rounded shrink-0 text-xs font-bold
                  [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                  focus:opacity-100 transition-opacity
                  hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              >
                +
              </button>
            )}
            {!isSpecial && (
              <button
                type="button"
                title={`Duplicate ${group.name}`}
                onClick={e => { e.stopPropagation(); onDuplicate(group.id) }}
                aria-label={`Duplicate collection ${group.name}`}
                className="ml-1 p-1 rounded shrink-0 text-xs font-bold
                  [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                  focus:opacity-100 transition-opacity
                  hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              >
                ⧉
              </button>
            )}
            <button
              type="button"
              onClick={handleEditClick}
              aria-label={`Rename collection ${group.name}`}
              className="ml-1 p-1 rounded shrink-0
                [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                focus:opacity-100 transition-opacity
                hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
            >
              ✏️
            </button>
            {!isSpecial && (
              <button
                type="button"
                onClick={handleDelete}
                aria-label={`Delete collection ${group.name}`}
                className="ml-1 mr-1 p-1 rounded shrink-0
                  [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                  focus:opacity-100 transition-opacity
                  hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              >
                🗑
              </button>
            )}
            {collection?.shareCode && !isSpecial && !linkExpired && (
              <button
                type="button"
                aria-label="Check for updates"
                title="Check for updates"
                onClick={handleCheckUpdates}
                disabled={refreshing}
                className="ml-1 p-1 rounded shrink-0 text-xs
                  [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                  focus:opacity-100 transition-opacity
                  hover:bg-gray-200 dark:hover:bg-gray-600 text-indigo-500 dark:text-indigo-400
                  disabled:opacity-40"
              >
                {refreshing ? '…' : '↻'}
              </button>
            )}
            {collection?.shareCode && !isSpecial && linkExpired && (
              <span className="ml-1 px-1.5 py-0.5 text-xs text-gray-400 dark:text-gray-500 shrink-0">
                Link expired
              </span>
            )}
          </>
        )}
      </div>
      {open && (
        (isSpecial || isExportMode) ? (
          <ul className="ml-2 space-y-0.5">
            {group.entries.map(entry => (
              <SongListItem key={entry.id} entry={entry} onSelect={onSelect} collectionId={group.id} />
            ))}
          </ul>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
              <ul className="ml-2 space-y-0.5">
                {group.entries.map(entry => (
                  <SortableSongListItem key={entry.id} entry={entry} onSelect={onSelect} collectionId={group.id} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )
      )}
      {pendingRefresh && (
        <ConflictPickerModal
          conflicts={pendingRefresh.conflicts}
          onApply={handleConflictApply}
          onCancel={() => setPendingRefresh(null)}
        />
      )}
    </li>
  )
}
