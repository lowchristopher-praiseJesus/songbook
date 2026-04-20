export function RecorderButton({ status, onStart, onStop, onPause, onResume }) {
  const isRecording = status === 'recording'
  const isPaused = status === 'paused'
  const isRequesting = status === 'requesting'

  if (isRecording || isPaused) {
    return (
      <div className="flex items-center gap-1">
        {isRecording && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        )}
        {isPaused ? (
          <button
            type="button"
            onClick={onResume}
            aria-label="Resume recording"
            className="text-sm px-2 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg border border-yellow-300 dark:border-yellow-600 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          >
            ▶ Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            aria-label="Pause recording"
            className="text-sm px-2 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg border border-red-300 dark:border-red-600 hover:bg-red-200 dark:hover:bg-red-900/50 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            ⏸ Pause
          </button>
        )}
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop recording"
          className="text-sm px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          ⏹ Stop
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={isRequesting}
      aria-label="Start recording"
      title="Record this song"
      className="text-sm px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      🎙 Rec
    </button>
  )
}
