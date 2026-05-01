// src/components/Conductor/ConductorBar.jsx
export function ConductorBar({ sync }) {
  const { live, phase, broadcastTime, isDirector, isFollowing, isBroadcasting,
          followerCount, startBroadcast, stopBroadcast, followDirector, stopFollowing } = sync

  if (isDirector) {
    if (!isBroadcasting) {
      return (
        <button
          onClick={startBroadcast}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
            bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300
            hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
          aria-label="Start conductor broadcast"
        >
          ▶ Start Broadcast
        </button>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Broadcasting · {followerCount} following
        </span>
        <button
          onClick={stopBroadcast}
          className="px-2 py-1 rounded text-xs font-medium
            bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300
            hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors"
          aria-label="Stop broadcast"
        >
          Stop
        </button>
      </div>
    )
  }

  // Follower states
  if (phase === 'dormant' || phase === 'waiting') {
    const timeLabel = broadcastTime
      ? new Date(broadcastTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : null
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {timeLabel ? `Broadcast at ${timeLabel} — waiting...` : 'Waiting for broadcast...'}
      </span>
    )
  }

  if (phase === 'ended') {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        Broadcast has ended
      </span>
    )
  }

  // phase === 'live'
  if (!live) return null

  if (!isFollowing) {
    return (
      <button
        onClick={followDirector}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
          bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300
          hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors
          animate-[fadeIn_0.3s_ease-in]"
        aria-label="Follow director"
      >
        Follow Director
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        Following
      </span>
      <button
        onClick={stopFollowing}
        className="px-2 py-1 rounded text-xs font-medium
          bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300
          hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        aria-label="Stop following"
      >
        Stop
      </button>
    </div>
  )
}
