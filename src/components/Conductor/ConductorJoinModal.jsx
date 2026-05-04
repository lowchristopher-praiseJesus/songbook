import { useState, useEffect } from 'react'
import { fetchConductorStatus } from '../../lib/conductorApi'
import { useLibraryStore } from '../../store/libraryStore'

const overlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
const card    = "bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
const btnPrimary   = "w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
const btnSecondary = "w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
const btnCancel    = "w-full px-4 py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"

function StatusBadge({ live, loading, scheduledLabel, followerCount }) {
  if (loading) {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium">Checking…</span>
  }
  if (live) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live now
        </span>
        {followerCount > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{followerCount} following</span>
        )}
      </div>
    )
  }
  if (scheduledLabel) {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium">Starts {scheduledLabel}</span>
  }
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium">Waiting to start</span>
}

function CardHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 px-6 pt-6 pb-4">
      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-lg shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
      </div>
    </div>
  )
}

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
  const songLabel = `${collectionLabel} · ${songCount} song${songCount !== 1 ? 's' : ''}`

  const scheduledLabel = broadcastTime
    ? new Date(broadcastTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

  // — Dedupe path —
  if (isDedupe) {
    const isLive = serverStatus?.live ?? false
    return (
      <div className={overlay}>
        <div className={card}>
          <CardHeader icon="🎵" title="Already in your library" subtitle={songLabel} />
          <div className="px-6 pb-2">
            <StatusBadge live={isLive} loading={loadingStatus} scheduledLabel={scheduledLabel} followerCount={serverStatus?.followerCount ?? 0} />
          </div>
          <div className="px-6 py-5 flex flex-col gap-2">
            <button onClick={onRejoin} className={btnPrimary}>
              {isLive ? 'Rejoin & follow live' : 'Rejoin'}
            </button>
            <button onClick={onCancel} className={btnCancel}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // — Conductor link path —
  if (isConductorLink) {
    return (
      <div className={overlay}>
        <div className={card}>
          <CardHeader icon="🎙" title="Conductor link" subtitle={songLabel} />
          <div className="px-6 pb-4">
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              ⚠ This link gives you broadcast control. Don't share it further.
            </p>
            {scheduledLabel && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Scheduled: {scheduledLabel}</p>
            )}
          </div>
          <div className="px-6 pb-6 flex flex-col gap-2">
            <button onClick={() => onImport('conductor')} className={btnPrimary}>
              Import &amp; become Conductor
            </button>
            <button onClick={onCancel} className={btnCancel}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // — Follower path —
  const isLive = serverStatus?.live ?? false
  const followerCount = serverStatus?.followerCount ?? 0

  return (
    <div className={overlay}>
      <div className={card}>
        <CardHeader icon="🎵" title="Join broadcast" subtitle={songLabel} />
        <div className="px-6 pb-4 flex flex-col gap-2">
          <StatusBadge live={isLive} loading={loadingStatus} scheduledLabel={scheduledLabel} followerCount={followerCount} />
          {shareSongs.lyricsOnly && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Chords hidden — shared in lyrics-only mode.</p>
          )}
        </div>
        <div className="px-6 pb-6 flex flex-col gap-2">
          <button onClick={() => onImport('follower')} className={btnPrimary}>
            {isLive ? 'Import & follow live' : 'Import & wait for broadcast'}
          </button>
          <button onClick={() => onImport(null)} className={btnSecondary}>
            Songs only (no broadcast)
          </button>
          <button onClick={onCancel} className={btnCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
