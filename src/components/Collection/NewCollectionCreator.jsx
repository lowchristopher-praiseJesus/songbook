import { useState, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'

export function NewCollectionCreator({ onOpenSidebar }) {
  const createCollection = useLibraryStore(s => s.createCollection)
  const setSelectedCollectionId = useLibraryStore(s => s.setSelectedCollectionId)
  const setIsCreatingNewCollection = useLibraryStore(s => s.setIsCreatingNewCollection)

  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  function handleCreate() {
    const trimmed = draft.trim()
    if (!trimmed) return
    const newId = createCollection(trimmed)
    if (newId) setSelectedCollectionId(newId)
    setIsCreatingNewCollection(false)
  }

  function handleCancel() {
    setIsCreatingNewCollection(false)
    if (window.innerWidth < 768) onOpenSidebar?.()
  }

  const disabledBtnClass = `w-full py-2.5 rounded-lg border border-gray-200 dark:border-gray-700
    text-gray-400 dark:text-gray-600 text-sm font-medium cursor-not-allowed opacity-50`

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={handleCancel}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          New Collection
        </h1>

        {/* Name input */}
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleCreate() }
            if (e.key === 'Escape') handleCancel()
          }}
          placeholder="Collection name…"
          className="w-full px-3 py-2 text-[16px] rounded-lg border border-indigo-400
            bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
            outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        {/* Create / Cancel */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!draft.trim()}
            className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700
              text-white text-sm font-semibold transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
              text-gray-600 dark:text-gray-400 text-sm font-medium
              hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Disabled action buttons */}
      <div className="mb-8 space-y-2">
        <button type="button" disabled className={disabledBtnClass}>Add Songs</button>
        <button type="button" disabled className={disabledBtnClass}>Rename</button>
        <button type="button" disabled className={disabledBtnClass}>Duplicate</button>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <button
            type="button"
            disabled
            className={`w-full py-2.5 rounded-lg border border-red-200 dark:border-red-900
              text-red-400 dark:text-red-700 text-sm font-medium cursor-not-allowed opacity-50`}
          >
            Delete Collection
          </button>
        </div>
      </div>
    </div>
  )
}
