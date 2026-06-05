import { useState, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { buildGroups } from '../../lib/collectionUtils'
import { CollectionCard } from './CollectionCard'

export function CollectionsPanel({ onSelect, onGroupCheckboxChange }) {
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const createCollection = useLibraryStore(s => s.createCollection)
  const setSelectedCollectionId = useLibraryStore(s => s.setSelectedCollectionId)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const escapeRef = useRef(false)

  const groups = buildGroups(index, collections)


  function confirmCreate() {
    if (draft.trim()) {
      const newId = createCollection(draft.trim())
      if (newId) setSelectedCollectionId(newId)
    }
    setCreating(false)
    setDraft('')
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
        {/* New Collection trigger */}
        <li>
          {creating ? (
            <div className="px-1 py-1">
              <input
                autoFocus
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Collection name…"
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); confirmCreate() }
                  if (e.key === 'Escape') {
                    escapeRef.current = true
                    setCreating(false)
                    setDraft('')
                  }
                }}
                onBlur={() => {
                  if (escapeRef.current) { escapeRef.current = false; return }
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
              onClick={() => setCreating(true)}
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
          <CollectionCard
            key={group.id}
            group={group}
            onSelect={onSelect}
            onGroupCheckboxChange={onGroupCheckboxChange}
          />
        ))}

        {groups.length === 0 && !creating && (
          <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            No songs yet
          </li>
        )}
      </ul>
    </div>
  )
}
