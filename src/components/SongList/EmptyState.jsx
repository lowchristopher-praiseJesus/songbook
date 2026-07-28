import { MusicalNoteIcon } from '@heroicons/react/24/outline'

export function EmptyState({ onFileChange }) {
  // Drag-and-drop is meaningless on touch devices — point at the button instead.
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="mb-6 select-none">
        <div className="w-24 h-24 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
          <MusicalNoteIcon className="w-12 h-12 text-indigo-400 dark:text-indigo-500" />
        </div>
      </div>
      <h2 className="text-2xl font-semibold mb-2 text-gray-700 dark:text-gray-300">No songs yet</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-1">
        {coarsePointer ? 'Tap Import File to get started' : 'Drag a file here to get started'}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
        Supports SongBook Pro (.sbp) and ChordPro (.cho, .chordpro, .pro)
      </p>
      <label className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium cursor-pointer focus-within:ring-2 focus-within:ring-indigo-500">
        Import File
        <input
          type="file"
          accept=""
          multiple
          className="hidden"
          onChange={onFileChange}
        />
      </label>
    </div>
  )
}
