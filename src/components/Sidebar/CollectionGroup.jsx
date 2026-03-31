import { useState, useRef, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { SongListItem } from './SongListItem'

export function CollectionGroup({ group, onSelect }) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(group.name)
  const inputRef = useRef(null)
  const checkboxRef = useRef(null)
  const deleteCollection = useLibraryStore(s => s.deleteCollection)
  const renameCollection = useLibraryStore(s => s.renameCollection)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleGroupSelection = useLibraryStore(s => s.toggleGroupSelection)

  useEffect(() => {
    if (editing) {
      setDraft(group.name)
      inputRef.current?.select()
    }
  }, [editing, group.name])

  // Tri-state checkbox logic
  const groupIds = group.entries.map(e => e.id)
  const selectedCount = groupIds.filter(id => selectedSongIds.has(id)).length
  const allSelected = groupIds.length > 0 && selectedCount === groupIds.length
  const someSelected = selectedCount > 0 && !allSelected

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  function handleDelete(e) {
    e.stopPropagation()
    if (window.confirm(`Delete all ${group.entries.length} song${group.entries.length !== 1 ? 's' : ''} in "${group.name}"?`)) {
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

  const isSpecial = group.id === '__uncategorized__'

  return (
    <li>
      <div className="flex items-center group">
        {isExportMode && (
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => toggleGroupSelection(groupIds)}
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
            <span className="flex-1 text-left truncate">{group.name}</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-normal">
              {group.entries.length}
            </span>
          </button>
        )}
        {!editing && !isExportMode && (
          <>
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
          </>
        )}
      </div>
      {open && (
        <ul className="ml-2 space-y-0.5">
          {group.entries.map(entry => (
            <SongListItem key={entry.id} entry={entry} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}
