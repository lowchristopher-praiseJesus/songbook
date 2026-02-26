import { useState, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useFileImport } from '../../hooks/useFileImport'
import { SongListItem } from './SongListItem'
import { Button } from '../UI/Button'
import { Modal } from '../UI/Modal'

export function Sidebar({ isOpen, onAddToast }) {
  const [query, setQuery] = useState('')
  const [duplicateState, setDuplicateState] = useState(null)
  const fileInputRef = useRef()
  const index = useLibraryStore(s => s.index)

  // Duplicate resolution: show inline modal, resolve via Promise
  function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  function resolveDuplicate(resolution) {
    const { resolve } = duplicateState
    setDuplicateState(null)
    resolve(resolution)
  }

  const { importFiles } = useFileImport({
    onError: msg => onAddToast(msg, 'error'),
    onDuplicateCheck,
  })

  const filtered = query.trim()
    ? index.filter(e =>
        e.title.toLowerCase().includes(query.toLowerCase()) ||
        (e.artist ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : index

  function handleFileInput(e) {
    importFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  if (!isOpen) return null

  return (
    <aside className="w-64 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search songs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Song list */}
      <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
        {filtered.map(entry => (
          <SongListItem key={entry.id} entry={entry} />
        ))}
        {filtered.length === 0 && (
          <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            {query.trim() ? 'No matches' : 'No songs yet'}
          </li>
        )}
      </ul>

      {/* Import button */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
        >
          + Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sbp"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Duplicate resolution modal */}
      <Modal
        isOpen={!!duplicateState}
        title="Duplicate Song"
        onClose={() => resolveDuplicate('skip')}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          A song titled "{duplicateState?.title}" already exists. What would you like to do?
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="danger" onClick={() => resolveDuplicate('replace')}>Replace</Button>
          <Button variant="secondary" onClick={() => resolveDuplicate('keep-both')}>Keep Both</Button>
          <Button variant="ghost" onClick={() => resolveDuplicate('skip')}>Skip</Button>
        </div>
      </Modal>
    </aside>
  )
}
