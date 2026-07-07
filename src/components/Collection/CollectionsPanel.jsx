import { useLibraryStore } from '../../store/libraryStore'
import { buildGroups } from '../../lib/collectionUtils'
import { CollectionCard } from './CollectionCard'

export function CollectionsPanel({ onSelect, onClose, onGroupCheckboxChange }) {
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const setIsCreatingNewCollection = useLibraryStore(s => s.setIsCreatingNewCollection)

  const groups = buildGroups(index, [...collections].reverse())

  function handleNewCollection() {
    setIsCreatingNewCollection(true)
    if (window.innerWidth < 768) onClose?.()
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* New Collection trigger — fixed above the scrolling list */}
      <div className="px-2 pt-2 shrink-0">
        <button
          type="button"
          onClick={handleNewCollection}
          className="w-full flex items-center gap-1 px-2 py-1 text-xs
            text-indigo-500 dark:text-indigo-400
            border border-dashed border-gray-300 dark:border-gray-600 rounded
            hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20
            transition-colors"
        >
          + New Collection
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
        {groups.map(group => (
          <CollectionCard
            key={group.id}
            group={group}
            onSelect={onSelect}
            onGroupCheckboxChange={onGroupCheckboxChange}
          />
        ))}

        {groups.length === 0 && (
          <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            No songs yet
          </li>
        )}
      </ul>
    </div>
  )
}
