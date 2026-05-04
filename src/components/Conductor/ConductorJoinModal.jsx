import { useState, useEffect } from 'react'
import { fetchConductorStatus } from '../../lib/conductorApi'
import { useLibraryStore } from '../../store/libraryStore'

export function ConductorJoinModal({ isOpen, shareSongs, conductorToken, broadcastTime, onImport, onRejoin, onCancel }) {
  const [serverStatus, setServerStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const collections = useLibraryStore(s => s.collections)

  const isConductorLink = !!conductorToken
  const existingCollection = collections.find(c => c.conductorCode === shareSongs?.conductorCode)
  const isDedupe = !!existingCollection && !isConductorLink

  useEffect(() => {
    if (!isOpen || isConductorLink || !shareSongs?.conductorCode) return
    setLoadingStatus(true)
    fetchConductorStatus(shareSongs.conductorCode)
      .then(s => setServerStatus(s))
      .catch(() => setServerStatus(null))
      .finally(() => setLoadingStatus(false))
  }, [isOpen, shareSongs?.conductorCode, isConductorLink])

  if (!isOpen || !shareSongs) return null

  const collectionLabel = shareSongs.collectionName || 'Shared Songs'
  const songCount = shareSongs.songs.length

  const scheduledLabel = broadcastTime
    ? new Date(broadcastTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

  const overlayClass = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  const panelClass = "bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-5"

  // — Dedupe path —
  if (isDedupe) {
    const isLive = serverStatus?.live ?? false
    return (
      <div className={overlayClass}>
        <div className={panelClass}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Join broadcast</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <strong>{collectionLabel}</strong> is already in your library.
            {isLive
              ? ' The broadcast is live now.'
              : scheduledLabel
                ? ` Broadcast scheduled at ${scheduledLabel}.`
                : ' Waiting for broadcast to start.'}
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={onRejoin} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              {isLive ? 'Rejoin & follow' : 'Rejoin'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // — Conductor link path —
  if (isConductorLink) {
    return (
      <div className={overlayClass}>
        <div className={panelClass}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">🎙 Conductor link</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            You've been given conductor control of this broadcast:
          </p>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{collectionLabel} — {songCount} song{songCount !== 1 ? 's' : ''}</p>
          {scheduledLabel && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Scheduled: {scheduledLabel}</p>
          )}
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-4">
            ⚠ This link gives you broadcast control. Don't share it further.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={() => onImport('conductor')} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              Import &amp; become Conductor
            </button>
          </div>
        </div>
      </div>
    )
  }

  // — Follower path —
  const isLive = serverStatus?.live ?? false
  const followerCount = serverStatus?.followerCount ?? 0

  function statusLine() {
    if (loadingStatus) return 'Checking broadcast status…'
    if (!serverStatus) return scheduledLabel ? `Scheduled: ${scheduledLabel}` : 'Waiting to start'
    if (isLive) return `${followerCount} following`
    if (scheduledLabel) return `Starts at ${scheduledLabel}`
    return 'Waiting for broadcast to start'
  }

  return (
    <div className={overlayClass}>
      <div className={panelClass}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">🎵 Join broadcast</h2>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{collectionLabel} — {songCount} song{songCount !== 1 ? 's' : ''}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {isLive && <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium mr-2"><span className="w-2 h-2 rounded-full bg-green-500" />Live now</span>}
          {statusLine()}
        </p>
        {shareSongs.lyricsOnly && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Chords will be hidden — shared in lyrics-only mode.</p>
        )}
        <div className="flex gap-2 justify-end flex-wrap">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={() => onImport('follower')} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Songs only (no broadcast)</button>
          <button onClick={() => onImport('follower')} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            {isLive ? 'Import & follow live' : 'Import & wait for broadcast'}
          </button>
        </div>
      </div>
    </div>
  )
}
