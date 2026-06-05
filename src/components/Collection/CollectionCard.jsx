import { useRef, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'

export function CollectionCard({ group, onSelect, onGroupCheckboxChange }) {
  const highlightedCollectionId = useLibraryStore(s => s.highlightedCollectionId)
  const setSelectedCollectionId = useLibraryStore(s => s.setSelectedCollectionId)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleGroupSelection = useLibraryStore(s => s.toggleGroupSelection)
  const checkboxRef = useRef(null)

  const isActive = highlightedCollectionId === group.id
  const songIds = group.entries.map(e => e.id)
  const selectedCount = songIds.filter(id => selectedSongIds.has(id)).length
  const allSelected = songIds.length > 0 && selectedCount === songIds.length
  const someSelected = selectedCount > 0 && !allSelected

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  if (isExportMode) {
    return (
      <li className="flex items-center gap-2 px-2 py-1.5 rounded">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={() => {
            onGroupCheckboxChange?.(allSelected ? null : { name: group.name, id: group.id })
            toggleGroupSelection(songIds)
          }}
          onClick={e => e.stopPropagation()}
          className="h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{group.name}</span>
        <span className="px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs">
          {group.entries.length}
        </span>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => { setSelectedCollectionId(group.id); onSelect?.() }}
        className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
          isActive
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-200'
        }`}
      >
        <span className="flex-1 text-sm font-medium truncate">{group.name}</span>
        <span className="px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs shrink-0">
          {group.entries.length}
        </span>
      </button>
    </li>
  )
}
