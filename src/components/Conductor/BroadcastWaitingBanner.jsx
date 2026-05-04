import { useState, useEffect } from 'react'

function formatCountdown(ms) {
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return `${h > 0 ? `${h}h ` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function BroadcastWaitingBanner({ phase, broadcastTime, collectionName, previewSongTitle, onForget }) {
  const [countdown, setCountdown] = useState(null)

  useEffect(() => {
    if (!broadcastTime || phase === 'ended') { setCountdown(null); return }
    const tick = () => {
      const ms = new Date(broadcastTime).getTime() - Date.now()
      setCountdown(ms > 0 ? formatCountdown(ms) : null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [broadcastTime, phase])

  if (phase !== 'waiting' && phase !== 'dormant' && phase !== 'ended') return null

  if (phase === 'ended') {
    return (
      <div className="w-full bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">✓ Broadcast ended</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{collectionName} — the songs are kept in your library.</p>
        </div>
        <button
          onClick={onForget}
          className="text-xs text-gray-400 underline shrink-0"
          aria-label="Forget broadcast"
        >
          Forget broadcast
        </button>
      </div>
    )
  }

  const timeLabel = broadcastTime
    ? new Date(broadcastTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <div className="w-full bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            ⏳ Waiting for broadcast
          </p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
            {collectionName}
            {timeLabel ? ` · starts ${timeLabel}` : ''}
            {countdown ? ` (${countdown})` : ''}
          </p>
          {previewSongTitle && (
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
              Preview: &ldquo;{previewSongTitle}&rdquo; — the conductor will start here
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
