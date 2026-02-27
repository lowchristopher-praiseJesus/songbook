// src/components/Settings/SettingsPanel.jsx
import { useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useLibraryStore } from '../../store/libraryStore'
import { getStorageStats } from '../../lib/storage'
import { Button } from '../UI/Button'

export function SettingsPanel({ onClose, lyricsOnly, onToggleLyricsOnly }) {
  const { theme, setTheme } = useTheme()
  const index = useLibraryStore(s => s.index)
  const deleteSong = useLibraryStore(s => s.deleteSong)
  const stats = getStorageStats()

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function clearAll() {
    if (!window.confirm('Delete ALL songs? This cannot be undone.')) return
    ;[...index].forEach(e => deleteSong(e.id))
    onClose()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 id="settings-title" className="text-xl font-semibold dark:text-white">Settings</h2>
          <button type="button" aria-label="Close settings" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Theme */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 dark:text-gray-300">Theme</label>
          <div className="flex gap-2">
            {['light', 'dark', 'system'].map(t => (
              <Button
                key={t}
                variant={theme === t ? 'primary' : 'secondary'}
                onClick={() => setTheme(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Display */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 dark:text-gray-300">Display</label>
          <button
            type="button"
            role="switch"
            aria-checked={lyricsOnly}
            onClick={onToggleLyricsOnly}
            className="flex items-center gap-3 w-full text-left"
          >
            <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
              transition-colors duration-200 focus:outline-none
              ${lyricsOnly ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                ${lyricsOnly ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Lyrics only (hide chords)</span>
          </button>
        </div>

        {/* Storage stats */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 dark:text-gray-300">Library</label>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {`${index.length} song${index.length !== 1 ? 's' : ''}`}
          </p>
          <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              data-testid="storage-bar"
              className="h-full bg-indigo-600 rounded-full"
              style={{ width: `${Math.min(100, (stats.usedBytes / stats.limitBytes) * 100)}%` }}
            />
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <Button variant="danger" onClick={clearAll}>Clear All Data</Button>
        </div>
      </div>
    </div>
  )
}
