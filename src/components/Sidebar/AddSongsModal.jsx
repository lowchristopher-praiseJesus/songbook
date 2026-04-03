import { useState, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

export function AddSongsModal({ isOpen, collectionId, collectionName, onClose }) {
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const setCollectionSongs = useLibraryStore(s => s.setCollectionSongs)
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (isOpen && collectionId) {
      const col = collections.find(c => c.id === collectionId)
      setCheckedIds(new Set(col?.songIds ?? []))
      setFilter('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, collectionId])

  if (!isOpen) return null

  const sorted = [...index].sort((a, b) => a.title.localeCompare(b.title))
  const trimmed = filter.trim().toLowerCase()
  const visible = trimmed
    ? sorted.filter(e =>
        e.title.toLowerCase().includes(trimmed) ||
        (e.artist ?? '').toLowerCase().includes(trimmed)
      )
    : sorted

  // Map songId -> first other-collection name (for badge display)
  const otherCollectionLabel = {}
  for (const col of collections) {
    if (col.id === collectionId) continue
    for (const sid of col.songIds) {
      if (!otherCollectionLabel[sid]) otherCollectionLabel[sid] = col.name
    }
  }

  function toggle(id) {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    setCollectionSongs(collectionId, [...checkedIds])
    onClose()
  }

  return (
    <Modal isOpen={isOpen} title={`Add songs to "${collectionName}"`} onClose={onClose}>
      <input
        type="text"
        aria-label="Filter songs"
        placeholder="Filter songs..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
      />
      <ul className="max-h-64 overflow-y-auto space-y-0.5 mb-4">
        {visible.map(entry => (
          <li key={entry.id}>
            <label
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
                hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <input
                type="checkbox"
                aria-label={entry.title}
                checked={checkedIds.has(entry.id)}
                onChange={() => toggle(entry.id)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
                {entry.title}
              </span>
              {entry.artist && (
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {entry.artist}
                </span>
              )}
              {otherCollectionLabel[entry.id] && (
                <span className="text-xs text-indigo-400 dark:text-indigo-500 shrink-0 max-w-24 truncate">
                  {otherCollectionLabel[entry.id]}
                </span>
              )}
            </label>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
            No songs found
          </li>
        )}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save</Button>
      </div>
    </Modal>
  )
}
