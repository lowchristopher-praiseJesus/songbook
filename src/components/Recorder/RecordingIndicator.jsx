import { useRecordingStore } from '../../store/recordingStore'
import { formatElapsed } from './RecordingTimer'

export function RecordingIndicator() {
  const status = useRecordingStore(s => s.status)
  const elapsedMs = useRecordingStore(s => s.elapsedMs)

  if (status !== 'recording' && status !== 'paused') return null

  return (
    <span className="flex items-center gap-1.5 text-sm ml-2">
      {status === 'recording' ? (
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
      ) : (
        <span className="text-yellow-500" aria-hidden="true">⏸</span>
      )}
      <span
        className={`font-mono tabular-nums ${
          status === 'recording'
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {formatElapsed(elapsedMs)}
      </span>
    </span>
  )
}
