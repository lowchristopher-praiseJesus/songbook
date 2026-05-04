import { useState, useEffect } from 'react'
import { useBroadcastRegistry } from '../../hooks/useBroadcastRegistry'
import { useBroadcastStatuses } from '../../hooks/useBroadcastStatuses'
import { endBroadcast } from '../../lib/conductorApi'

function deriveUrl(shareCode, token, broadcastTime) {
  const base = `${window.location.origin}${window.location.pathname}?share=${shareCode}`
  const withToken = token ? `${base}&conductor_token=${token}` : base
  return broadcastTime
    ? `${withToken}&bt=${encodeURIComponent(new Date(broadcastTime).toISOString())}`
    : withToken
}

function StatusPill({ status }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>
  if (status.error === 'expired' || status.error === 'not_found') {
    return <span className="text-xs text-gray-400">Expired</span>
  }
  if (status.error) return <span className="text-xs text-red-400">Unavailable</span>
  if (status.live) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Live · {status.followerCount} following
      </span>
    )
  }
  return <span className="text-xs text-gray-400">Idle</span>
}

export function BroadcastsPanel({ conductorSync, onAddToast }) {
  const { broadcasts, endedBroadcasts, forgetBroadcast, markEnded } = useBroadcastRegistry()
  const [open, setOpen] = useState(true)
  const [confirmEnd, setConfirmEnd] = useState(null)
  const [confirmForget, setConfirmForget] = useState(null)

  const allCodes = broadcasts.map(b => b.conductorCode).filter(Boolean)
  const { statuses, loading, refresh } = useBroadcastStatuses(allCodes)

  useEffect(() => { if (open) refresh() }, [open, refresh])

  if (broadcasts.length === 0 && endedBroadcasts.length === 0) return null

  async function handleEndSession(collection) {
    setConfirmEnd(null)
    try {
      const token = collection.conductorDirectorToken
      if (token) await endBroadcast(collection.conductorCode, token)
    } catch { /* mark ended locally regardless */ }
    markEnded(collection.id)
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  function rowFor(col) {
    const status = statuses[col.conductorCode]
    const memberUrl = col.conductorShareCode
      ? deriveUrl(col.conductorShareCode, null, col.conductorBroadcastTime)
      : null
    const conductorUrl = col.conductorShareCode && col.conductorDirectorToken
      ? deriveUrl(col.conductorShareCode, col.conductorDirectorToken, null)
      : null

    const isActive = conductorSync?.conductorCode === col.conductorCode
    const isLive = isActive ? conductorSync.live : status?.live
    // Use live conductorSync data when available — it polls every 3s, unlike
    // the one-shot useBroadcastStatuses which only updates on manual refresh.
    const liveStatus = isActive
      ? { live: conductorSync.live, followerCount: conductorSync.followerCount }
      : status

    return (
      <div key={col.id} className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{col.conductorRole === 'follower' ? '👥' : '🎙'}</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{col.name}</span>
            </div>
            <div className="mt-0.5">
              <StatusPill status={liveStatus} />
            </div>
          </div>
          {!isActive && loading && <span className="text-xs text-gray-400 shrink-0">...</span>}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {memberUrl && (
            <button
              onClick={() => copyToClipboard(memberUrl)}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Copy member link
            </button>
          )}
          {conductorUrl && (
            <button
              onClick={() => copyToClipboard(conductorUrl)}
              className="text-xs px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/40"
            >
              Copy conductor link
            </button>
          )}
          {isActive && col.conductorRole === 'conductor' && !isLive && (
            <button
              onClick={conductorSync.startBroadcast}
              className="text-xs px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/40"
            >
              ▶ Start
            </button>
          )}
          {isActive && col.conductorRole === 'conductor' && isLive && (
            <button
              onClick={conductorSync.stopBroadcast}
              className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/40"
            >
              Stop
            </button>
          )}
          {col.conductorRole !== 'coordinator' && (
            confirmForget === col.id ? (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-gray-500">Songs kept.</span>
                <button onClick={() => { forgetBroadcast(col.id); setConfirmForget(null) }} className="text-red-600 dark:text-red-400 underline">Confirm</button>
                <button onClick={() => setConfirmForget(null)} className="text-gray-500 underline">Cancel</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmForget(col.id)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Forget
              </button>
            )
          )}
          {col.conductorRole === 'conductor' && (
            confirmEnd === col.id ? (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-gray-500 dark:text-gray-400">End for everyone?</span>
                <button onClick={() => handleEndSession(col)} className="text-red-600 dark:text-red-400 underline">End session</button>
                <button onClick={() => setConfirmEnd(null)} className="text-gray-500 underline">Cancel</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmEnd(col.id)}
                className="text-xs px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                End session
              </button>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-2 pb-1 px-2">
      <button
        className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
        onClick={() => setOpen(o => !o)}
      >
        <span>Broadcasts</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div>
          {broadcasts.map(rowFor)}
          {endedBroadcasts.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-1">Ended</p>
              {endedBroadcasts.map(col => (
                <div key={col.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-400 truncate">{col.name}</span>
                  <button
                    onClick={() => forgetBroadcast(col.id)}
                    className="text-xs text-gray-400 underline ml-2 shrink-0"
                  >
                    Forget
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={refresh}
            className="mt-2 text-xs text-gray-400 underline"
          >
            Refresh status
          </button>
        </div>
      )}
    </div>
  )
}
