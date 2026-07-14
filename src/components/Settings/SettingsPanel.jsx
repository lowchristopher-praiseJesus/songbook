// src/components/Settings/SettingsPanel.jsx
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useLicense } from '../../contexts/LicenseContext'
import { useLibraryStore } from '../../store/libraryStore'
import { getStorageStats, getFirecrawlKey, setFirecrawlKey } from '../../lib/storage'
import { getCreditUsage } from '../../lib/ugImport/firecrawlClient'
import { Button } from '../UI/Button'
import { DisplayTab } from './DisplayTab'

export function SettingsPanel({ onClose, lyricsOnly, onToggleLyricsOnly, hideChordDiagram, onToggleHideChordDiagram, displaySettings, fontSize, onFontSizeChange }) {
  const [tab, setTab] = useState('general')
  const { theme, setTheme } = useTheme()
  const index = useLibraryStore(s => s.index)
  const deleteSong = useLibraryStore(s => s.deleteSong)
  const stats = getStorageStats()
  const [firecrawlKey, setFirecrawlKeyState] = useState(getFirecrawlKey)
  const [showKey, setShowKey] = useState(false)
  const [creditUsage, setCreditUsage] = useState({ status: 'idle', data: null, error: null })
  const creditsTimerRef = useRef(null)
  const { licenseKey, setLicenseKey, licenseStatus } = useLicense()
  const [licenseInput, setLicenseInput] = useState(licenseKey ?? '')
  const [showLicenseKey, setShowLicenseKey] = useState(false)

  function handleKeyChange(e) {
    setFirecrawlKeyState(e.target.value)
    setFirecrawlKey(e.target.value)
  }

  function handleLicenseInputChange(e) {
    setLicenseInput(e.target.value)
  }

  function handleLicenseBlur() {
    const trimmed = licenseInput.trim()
    if (trimmed) {
      setLicenseKey(trimmed)
    } else {
      setLicenseKey(null)
    }
  }

  function handleClearLicense() {
    setLicenseInput('')
    setLicenseKey(null)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const trimmed = firecrawlKey.trim()
    clearTimeout(creditsTimerRef.current)
    if (!trimmed) {
      setCreditUsage({ status: 'idle', data: null, error: null })
      return
    }
    creditsTimerRef.current = setTimeout(() => {
      setCreditUsage({ status: 'loading', data: null, error: null })
      getCreditUsage(trimmed)
        .then(data => setCreditUsage({ status: 'success', data, error: null }))
        .catch(err => setCreditUsage({ status: 'error', data: null, error: err.message }))
    }, 600)
    return () => clearTimeout(creditsTimerRef.current)
  }, [firecrawlKey])

  function clearAll() {
    if (!window.confirm('Delete ALL songs? This cannot be undone.')) return
    ;[...index].forEach(e => deleteSong(e.id))
    onClose()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id="settings-title" className="text-xl font-semibold dark:text-white">Settings</h2>
          <button type="button" aria-label="Close settings" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-0 mb-3 sm:mb-5">
          {['general', 'display'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium border transition-colors
                ${t === 'general' ? 'rounded-l-lg' : 'rounded-r-lg'}
                ${tab === t
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'display' && displaySettings && (
          <DisplayTab
            settings={displaySettings.settings}
            updateElement={displaySettings.updateElement}
            resetAll={displaySettings.resetAll}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
          />
        )}

        {tab === 'general' && (<>

        {/* Theme */}
        <div className="mb-4 sm:mb-6">
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
        <div className="mb-4 sm:mb-6">
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
          <button
            type="button"
            role="switch"
            aria-checked={hideChordDiagram}
            onClick={onToggleHideChordDiagram}
            className="flex items-center gap-3 w-full text-left mt-3"
          >
            <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
              transition-colors duration-200 focus:outline-none
              ${hideChordDiagram ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                ${hideChordDiagram ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Hide chord diagrams</span>
          </button>
        </div>

        {/* Firecrawl API Key */}
        <div className="mb-4 sm:mb-6">
          <label htmlFor="firecrawl-api-key" className="block text-sm font-medium mb-2 dark:text-gray-300">
            Firecrawl API Key
            <span className="ml-1 text-xs font-normal text-gray-400">(for UG search)</span>
          </label>
          <div className="flex gap-2">
            <input
              id="firecrawl-api-key"
              type={showKey ? 'text' : 'password'}
              value={firecrawlKey}
              onChange={handleKeyChange}
              placeholder="fc-…"
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="px-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label={showKey ? 'Hide Firecrawl API key' : 'Show Firecrawl API key'}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Stored locally.{' '}
            <a
              href="/Documentation-songbook/firecrawl-api-key-guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600 dark:hover:text-gray-300"
            >
              How to get a Firecrawl API key
            </a>
          </p>
          {creditUsage.status === 'loading' && (
            <p className="mt-2 text-xs text-gray-400">Checking credit balance…</p>
          )}
          {creditUsage.status === 'success' && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {`${creditUsage.data.remainingCredits.toLocaleString()} / ${creditUsage.data.planCredits.toLocaleString()} credits remaining`}
              </p>
              <div className="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  data-testid="firecrawl-credit-bar"
                  className="h-full bg-indigo-600 rounded-full"
                  style={{ width: `${creditUsage.data.planCredits > 0 ? Math.max(0, Math.min(100, ((creditUsage.data.planCredits - creditUsage.data.remainingCredits) / creditUsage.data.planCredits) * 100)) : 0}%` }}
                />
              </div>
            </div>
          )}
          {creditUsage.status === 'error' && (
            <p className={`mt-2 text-xs ${creditUsage.error === 'UNAUTHORIZED' ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
              {creditUsage.error === 'UNAUTHORIZED' && 'Invalid API key'}
              {creditUsage.error === 'NOT_FOUND' && 'Credit usage not available for this key'}
              {creditUsage.error === 'NETWORK_ERROR' && 'Could not check credit balance'}
            </p>
          )}
        </div>

        {/* Conductor Broadcast License */}
        <div className="mb-4 sm:mb-6">
          <label htmlFor="conductor-license-key" className="block text-sm font-medium mb-2 dark:text-gray-300">
            Conductor Broadcast License
          </label>
          <div className="flex gap-2">
            <input
              id="conductor-license-key"
              type={showLicenseKey ? 'text' : 'password'}
              value={licenseInput}
              onChange={handleLicenseInputChange}
              onBlur={handleLicenseBlur}
              onKeyDown={e => { if (e.key === 'Enter') handleLicenseBlur() }}
              placeholder="SONGBOOK-XXXX-XXXX-XXXX-XXXX"
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShowLicenseKey(v => !v)}
              className="px-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label={showLicenseKey ? 'Hide license key' : 'Show license key'}
            >
              {showLicenseKey ? 'Hide' : 'Show'}
            </button>
            {licenseKey && (
              <button
                type="button"
                onClick={handleClearLicense}
                className="px-2 text-sm text-red-500 hover:text-red-700 dark:hover:text-red-300"
                aria-label="Clear license key"
              >
                Clear
              </button>
            )}
          </div>
          {licenseStatus === 'valid' && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400">License active &mdash; Conductor Broadcast unlocked</p>
          )}
          {licenseStatus === 'expired' && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">License expired &mdash; Conductor Broadcast is locked</p>
          )}
          {licenseStatus === 'invalid' && licenseInput.trim() && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Invalid license key</p>
          )}
          {licenseStatus === 'missing' && !licenseInput.trim() && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Enter a license key to unlock Conductor Broadcast.
            </p>
          )}
        </div>

        {/* Storage stats */}
        <div className="mb-4 sm:mb-6">
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

        {/* About */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center text-xs text-gray-400 dark:text-gray-500">
          <div className="mb-1">Version {__APP_VERSION__}</div>
          Created by{' '}
          <a
            href="https://sherr.it/Lh3ngLLZwJgAsjg"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600 dark:hover:text-gray-300"
          >
            Christopher Low
          </a>
        </div>

        </>)}
      </div>
    </div>
  )
}
