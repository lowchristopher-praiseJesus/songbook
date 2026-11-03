import { useState } from 'react'

const plural = (n, word = 'song') => `${n} ${word}${n !== 1 ? 's' : ''}`

/**
 * Confirmation body for deleting a collection, with an opt-in to also delete
 * the collection's songs from the library. Only songs that belong to no other
 * collection are offered for deletion (exclusiveCount); the rest are kept.
 *
 * onConfirm(deleteSongs: boolean)
 */
export function DeleteCollectionPrompt({ name, songCount, exclusiveCount, liveBroadcast = false, onConfirm, onCancel }) {
  const [deleteSongs, setDeleteSongs] = useState(false)
  const sharedCount = songCount - exclusiveCount

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {liveBroadcast
          ? `"${name}" has a live broadcast. Deleting it will end the broadcast for all followers. Continue?`
          : `Remove "${name}"?`}
      </p>

      {exclusiveCount > 0 && (
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteSongs}
            onChange={e => setDeleteSongs(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-red-600"
          />
          <span>Also delete {plural(exclusiveCount)} from my library</span>
        </label>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {!deleteSongs
          ? `The ${plural(songCount)} will remain in your library.`
          : <>
              <span className="text-red-600 dark:text-red-400 font-medium">This can’t be undone.</span>
              {sharedCount > 0 && ` ${plural(sharedCount)} also in other collections will be kept.`}
            </>}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(deleteSongs)}
          className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white
            hover:bg-red-700 transition-colors"
        >
          {deleteSongs ? 'Delete collection and songs' : 'Yes, delete'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            text-gray-600 dark:text-gray-400
            hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
