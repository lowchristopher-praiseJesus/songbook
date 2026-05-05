import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchAlbumMeta, albumTrackUrl, albumCoverUrl } from '../../lib/albumApi'
import { blobToWav } from '../../lib/wavUtils'

function formatTime(sec) {
  if (!isFinite(sec)) return '0:00'
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function formatDuration(ms) {
  if (!ms) return ''
  return formatTime(ms / 1000)
}

export function AlbumPage({ albumCode }) {
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [trackLoading, setTrackLoading] = useState(false)
  const audioRef = useRef(null)
  const progressRef = useRef(null)
  const isDraggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const normalizedUrlRef = useRef(null)

  useEffect(() => {
    fetchAlbumMeta(albumCode)
      .then(setMeta)
      .catch(err => setError(err.code === 'not_found' ? 'Album not found.' : 'Could not load album.'))
  }, [albumCode])

  // Revoke blob URL on unmount
  useEffect(() => () => {
    if (normalizedUrlRef.current) URL.revokeObjectURL(normalizedUrlRef.current)
  }, [])

  const currentTrack = meta?.tracks?.[currentIdx] ?? null

  const loadNormalizedTrack = useCallback(async (trackUrl, shouldPlay) => {
    const audio = audioRef.current
    if (!audio) return
    if (normalizedUrlRef.current) {
      URL.revokeObjectURL(normalizedUrlRef.current)
      normalizedUrlRef.current = null
    }
    setTrackLoading(true)
    try {
      const blob = await fetch(trackUrl).then(r => r.blob())
      const wavBuffer = await blobToWav(blob)
      const blobUrl = URL.createObjectURL(new Blob([wavBuffer], { type: 'audio/wav' }))
      normalizedUrlRef.current = blobUrl
      audio.src = blobUrl
      audio.load()
      if (shouldPlay) audio.play().catch(() => {})
    } catch {
      audio.src = trackUrl
      audio.load()
      if (shouldPlay) audio.play().catch(() => {})
    } finally {
      setTrackLoading(false)
    }
  }, [])

  // When the current track changes, reload (and play if already playing)
  useEffect(() => {
    if (!currentTrack) return
    loadNormalizedTrack(albumTrackUrl(albumCode, currentTrack.trackId), playing)
  }, [currentIdx, albumCode]) // eslint-disable-line react-hooks/exhaustive-deps

  const playTrack = useCallback((idx) => {
    setCurrentIdx(idx)
    setPlaying(true)
    if (!meta) return
    loadNormalizedTrack(albumTrackUrl(albumCode, meta.tracks[idx].trackId), true)
  }, [albumCode, meta, loadNormalizedTrack])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (!normalizedUrlRef.current) {
      if (meta) loadNormalizedTrack(albumTrackUrl(albumCode, meta.tracks[currentIdx].trackId), true)
      return
    }
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play().catch(() => {}); setPlaying(true) }
  }

  // webm recordings don't embed duration, so audio.duration is often Infinity.
  // Fall back to the stored track duration (ms) from album metadata.
  const effectiveDuration = isFinite(duration) && duration > 0
    ? duration
    : (currentTrack?.duration ?? 0) / 1000

  function getSeekPct(e) {
    const rect = progressRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  function seekTo(pct) {
    if (audioRef.current && effectiveDuration) audioRef.current.currentTime = pct * effectiveDuration
  }

  function handlePointerDown(e) {
    if (!effectiveDuration) return
    e.preventDefault()
    progressRef.current.setPointerCapture(e.pointerId)
    isDraggingRef.current = true
    setIsDragging(true)
    seekTo(getSeekPct(e))
  }

  function handlePointerMove(e) {
    if (!isDraggingRef.current) return
    seekTo(getSeekPct(e))
  }

  function handlePointerUp(e) {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    seekTo(getSeekPct(e))
  }

  function handlePrev() { if (currentIdx > 0) playTrack(currentIdx - 1) }
  function handleNext() { if (meta && currentIdx < meta.tracks.length - 1) playTrack(currentIdx + 1) }

  if (error) return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400">{error}</p>
    </div>
  )

  if (!meta) return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
      <div className="animate-spin text-3xl">🎵</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Back link */}
      <div className="px-4 pt-4">
        <a
          href={window.location.origin + window.location.pathname}
          className="inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400
            hover:underline"
        >
          ← Songsheet
        </a>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
        onDurationChange={e => setDuration(e.target.duration)}
        onEnded={handleNext}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <div className="max-w-5xl mx-auto px-4 py-10 md:py-16">
        <div className="flex flex-col md:flex-row gap-8 md:gap-12">

          {/* ── Left column: cover + player ─────────────────── */}
          <div className="flex flex-col items-center md:items-start gap-5 md:w-72 shrink-0">
            {/* Cover art */}
            {meta.hasCover ? (
              <img
                src={albumCoverUrl(albumCode)}
                alt={`${meta.title} cover`}
                className="w-64 h-64 md:w-72 md:h-72 object-cover rounded-2xl shadow-xl"
              />
            ) : (
              <div className="w-64 h-64 md:w-72 md:h-72 rounded-2xl shadow-xl bg-gradient-to-br
                from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-6xl">🎵</span>
              </div>
            )}

            {/* Album info */}
            <div className="text-center md:text-left">
              <h1 className="text-2xl font-bold leading-tight">{meta.title}</h1>
              {meta.artist && (
                <p className="text-gray-500 dark:text-gray-400 mt-1">by {meta.artist}</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {meta.tracks.length} track{meta.tracks.length !== 1 ? 's' : ''} · Digital Album
              </p>
            </div>

            {/* Player controls */}
            {currentTrack && (
              <div className="w-full">
                {/* Now playing */}
                <p className="text-sm font-medium text-center md:text-left mb-3 truncate">
                  {currentTrack.title}
                </p>

                {/* Progress bar */}
                {(() => {
                  const pct = effectiveDuration ? (currentTime / effectiveDuration) * 100 : 0
                  return (
                    <div
                      ref={progressRef}
                      role="slider"
                      aria-label="Seek"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(pct)}
                      tabIndex={0}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onKeyDown={e => {
                        if (e.key === 'ArrowRight') audioRef.current.currentTime += 5
                        if (e.key === 'ArrowLeft') audioRef.current.currentTime -= 5
                      }}
                      className="relative w-full h-5 flex items-center cursor-pointer mb-1 touch-none"
                    >
                      <div className="absolute w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                        <div
                          className={`h-2 bg-indigo-600 rounded-full ${isDragging ? '' : 'transition-[width] duration-100'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div
                        className={`absolute w-4 h-4 bg-indigo-600 rounded-full shadow-md -translate-x-1/2
                          ${isDragging ? 'scale-125' : ''} transition-transform`}
                        style={{ left: `${pct}%` }}
                      />
                    </div>
                  )
                })()}
                <div className="flex justify-between text-xs text-gray-400 mb-3">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(effectiveDuration)}</span>
                </div>

                {/* Prev / Play / Next */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={handlePrev}
                    disabled={currentIdx === 0}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800
                      disabled:opacity-30 transition-colors"
                    aria-label="Previous track"
                  >
                    ⏮
                  </button>
                  <button
                    onClick={togglePlay}
                    disabled={trackLoading}
                    className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700
                      flex items-center justify-center text-white text-xl transition-colors shadow-md
                      disabled:opacity-70"
                    aria-label={trackLoading ? 'Loading' : playing ? 'Pause' : 'Play'}
                  >
                    {trackLoading ? <span className="animate-spin text-base">⏳</span> : playing ? '⏸' : '▶'}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!meta || currentIdx >= meta.tracks.length - 1}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800
                      disabled:opacity-30 transition-colors"
                    aria-label="Next track"
                  >
                    ⏭
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: track list ─────────────────────── */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Tracks
            </h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {meta.tracks.map((track, idx) => {
                const isCurrent = idx === currentIdx
                return (
                  <li
                    key={track.trackId}
                    className={`flex items-center gap-4 py-3 px-2 rounded-lg cursor-pointer
                      transition-colors group
                      ${isCurrent
                        ? 'bg-indigo-50 dark:bg-indigo-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    onClick={() => playTrack(idx)}
                  >
                    {/* Track number / playing indicator */}
                    <span className={`w-6 text-center text-sm shrink-0
                      ${isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {isCurrent && playing ? '♪' : idx + 1}
                    </span>

                    {/* Title */}
                    <span className={`flex-1 text-sm truncate
                      ${isCurrent ? 'font-semibold text-indigo-700 dark:text-indigo-300' : ''}`}>
                      {track.title}
                    </span>

                    {/* Duration */}
                    <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                      {formatDuration(track.duration)}
                    </span>

                    {/* Download */}
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        const blob = await fetch(albumTrackUrl(albumCode, track.trackId)).then(r => r.blob())
                        let downloadBlob = blob
                        let ext = 'webm'
                        try {
                          const wavBuffer = await blobToWav(blob)
                          downloadBlob = new Blob([wavBuffer], { type: 'audio/wav' })
                          ext = 'wav'
                        } catch { /* AudioContext unavailable, fall back to raw webm */ }
                        const a = document.createElement('a')
                        a.href = URL.createObjectURL(downloadBlob)
                        a.download = `${track.title}.${ext}`
                        a.click()
                        URL.revokeObjectURL(a.href)
                      }}
                      className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100
                        hover:bg-gray-200 dark:hover:bg-gray-700 transition-all text-gray-500"
                      aria-label={`Download ${track.title}`}
                      title="Download"
                    >
                      ↓
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
