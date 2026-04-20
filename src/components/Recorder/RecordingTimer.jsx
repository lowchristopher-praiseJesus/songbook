function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function RecordingTimer({ elapsedMs, status }) {
  if (status !== 'recording' && status !== 'paused') return null
  const formatted = formatElapsed(elapsedMs)
  return (
    <span
      aria-label={`Elapsed time ${formatted}`}
      className="font-mono text-sm tabular-nums text-red-600 dark:text-red-400"
    >
      {formatted}
    </span>
  )
}
