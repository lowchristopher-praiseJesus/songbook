import { useState, useEffect } from 'react'
import { useBroadcastRegistry } from '../../hooks/useBroadcastRegistry'
import { useBroadcastStatuses } from '../../hooks/useBroadcastStatuses'
import { endBroadcast } from '../../lib/conductorApi'

// — Shared button styles (match ConductorJoinModal) —
const btn     = 'text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors'
const btnGray = `${btn} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700`
const btnAmber = `${btn} bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30`
const btnIndigo = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`
const btnRed   = `${btn} bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30`

function deriveUrl(shareCode, token, broadcastTime) {
  const base = `${window.location.origin}${window.location.pathname}?share=${shareCode}`
  const withToken = token ? `${base}&conductor_token=${token}` : base
  return broadcastTime
    ? `${withToken}&bt=${encodeURIComponent(new Date(broadcastTime).toISOString())}`
    : withToken
}

function LivePill({ status }) {
  if (!status) return null
  if (status.error === 'expired' || status.error === 'not_found') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 text-xs">Expired</span>
  }
  if (status.error) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-400 text-xs">Unavailable</span>
  }
  if (status.live) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Live · {status.followerCount} following
      </span>
    )
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs">Idle</span>
}

function ConfirmBanner({ message, confirmLabel, onConfirm, onCancel, danger = false }) {
  return (
    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">{message}</span>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={onConfirm}
          className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
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
    const liveStatus = isActive
      ? { live: conductorSync.live, followerCount: conductorSync.followerCount }
      : status

    const isForgetPending = confirmForget === col.id
    const isEndPending    = confirmEnd === col.id

    return (
      <div key={col.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 mb-2">
        {/* Row header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm shrink-0">{col.conductorRole === 'follower' ? '👥' : '🎙'}</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{col.name}</span>
          </div>
          {!isActive && loading && <span className="text-xs text-gray-400 shrink-0 animate-pulse">…</span>}
        </div>

        {/* Status */}
        <div className="mb-3">
          <LivePill status={liveStatus} />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5">
          {memberUrl && (
            <button onClick={() => copyToClipboard(memberUrl)} className={btnGray}>
              Copy member link
            </button>
          )}
          {conductorUrl && (
            <button onClick={() => copyToClipboard(conductorUrl)} className={btnAmber}>
              Copy conductor link
            </button>
          )}
          {isActive && col.conductorRole === 'conductor' && !isLive && (
            <button onClick={conductorSync.startBroadcast} className={btnIndigo}>
              ▶ Start broadcast
            </button>
          )}
          {isActive && col.conductorRole === 'conductor' && isLive && (
            <button onClick={conductorSync.stopBroadcast} className={btnGray}>
              ⏹ Stop
            </button>
          )}
          {col.conductorRole !== 'coordinator' && !isForgetPending && (
            <button onClick={() => setConfirmForget(col.id)} className={btnGray}>
              Forget
            </button>
          )}
          {col.conductorRole === 'conductor' && !isEndPending && (
            <button onClick={() => setConfirmEnd(col.id)} className={btnRed}>
              End session
            </button>
          )}
        </div>

        {/* Inline confirmations */}
        {isForgetPending && (
          <ConfirmBanner
            message="Songs stay in library."
            confirmLabel="Forget"
            onConfirm={() => { forgetBroadcast(col.id); setConfirmForget(null) }}
            onCancel={() => setConfirmForget(null)}
          />
        )}
        {isEndPending && (
          <ConfirmBanner
            message="End session for everyone?"
            confirmLabel="End session"
            onConfirm={() => handleEndSession(col)}
            onCancel={() => setConfirmEnd(null)}
            danger
          />
        )}
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 pb-2 px-2">
      {/* Section header */}
      <button
        className="flex items-center justify-between w-full mb-2"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Broadcasts</span>
        <span className="text-gray-400 dark:text-gray-500 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div>
          {broadcasts.map(rowFor)}

          {endedBroadcasts.length > 0 && (
            <div className="mt-1">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mb-1.5 px-1">Ended</p>
              {endedBroadcasts.map(col => (
                <div key={col.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/50 mb-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{col.name}</span>
                  <button
                    onClick={() => forgetBroadcast(col.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline ml-2 shrink-0 transition-colors"
                  >
                    Forget
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={refresh}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            Refresh status
          </button>
        </div>
      )}
    </div>
  )
}
