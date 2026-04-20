import { useRef, useState } from 'react'

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

function formatTime(seconds) {
  const totalSec = Math.floor(seconds)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function AudioPlayer({ src, mimeType, durationMs }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationMs / 1000)
  const [rate, setRate] = useState(1)

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    isPlaying ? audio.pause() : audio.play()
  }

  function handleRateChange(e) {
    const val = Number(e.target.value)
    setRate(val)
    if (audioRef.current) audioRef.current.playbackRate = val
  }

  function handleSeek(e) {
    const val = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = val
    setCurrentTime(val)
  }

  return (
    <div className="flex flex-col gap-2">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration
          if (d && isFinite(d)) setDuration(d)
        }}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
        preload="metadata"
      >
        {mimeType && <source src={src} type={mimeType} />}
      </audio>

      <input
        type="range"
        role="slider"
        aria-label="Seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        className="w-full accent-indigo-600"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <span className="text-xs font-mono tabular-nums text-gray-600 dark:text-gray-400">
          {formatTime(currentTime)}
        </span>
        <span className="text-xs text-gray-400">/</span>
        <span className="text-xs font-mono tabular-nums text-gray-600 dark:text-gray-400">
          {formatTime(duration)}
        </span>

        <label className="sr-only" htmlFor="playback-rate-select">Playback rate</label>
        <select
          id="playback-rate-select"
          aria-label="Playback rate"
          value={rate}
          onChange={handleRateChange}
          className="ml-auto text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {RATES.map(r => <option key={r} value={r}>{r}×</option>)}
        </select>
      </div>
    </div>
  )
}
