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
  // Map<trackId, Promise<string>> — Promise resolves to a blob URL
  const trackCacheRef = useRef(new Map())
  // Which trackId is currently being loaded into the audio element
  const currentTrackIdRef = useRef(null)
  // Stable ref to meta so callbacks don't go stale
  const metaRef = useRef(null)
  metaRef.current = meta

  useEffect(() => {
    fetchAlbumMeta(albumCode)
      .then(setMeta)
      .catch(err => setError(err.code === 'not_found' ? 'Album not found.' : 'Could not load album.'))
  }, [albumCode])

  // Revoke all cached blob URLs on unmount
  useEffect(() => () => {
    trackCacheRef.current.forEach(p => p.then(url => URL.revokeObjectURL(url)).catch(() => {}))
    trackCacheRef.current.clear()
  }, [])

  // Fetch, filter, normalize, and cache a track. Concurrent calls for the same
  // trackId share the same Promise so work is never duplicated.
  const processTrack = useCallback((trackId) => {
    if (trackCacheRef.current.has(trackId)) return trackCacheRef.current.get(trackId)
    const promise = fetch(albumTrackUrl(albumCode, trackId))
      .then(r => r.blob())
      .then(blob => blobToWav(blob))
      .then(wav => URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })))
    // On failure remove the entry so a retry can try again
    promise.catch(() => trackCacheRef.current.delete(trackId))
    trackCacheRef.current.set(trackId, promise)
    return promise
  }, [albumCode])

  // Once meta arrives, process all tracks sequentially in the background so
  // they are ready before the user needs them.
  useEffect(() => {
    if (!meta) return
    let cancelled = false
    ;(async () => {
      for (const track of meta.tracks) {
        if (cancelled) break
        try { await processTrack(track.trackId) } catch {}
      }
    })()
    return () => { cancelled = true }
  }, [meta, processTrack])

  // Load a processed track into the audio element. If the cache already has it
  // the await resolves instantly; otherwise shows a spinner until ready.
  const loadTrack = useCallback(async (trackId, shouldPlay) => {
    const audio = audioRef.current
    if (!audio) return
    currentTrackIdRef.current = trackId
    setTrackLoading(true)
    try {
      const blobUrl = await processTrack(trackId)
      if (currentTrackIdRef.current !== trackId) return // user switched away
      audio.src = blobUrl
      audio.load()
      if (shouldPlay) audio.play().catch(() => {})
    } catch {
      if (currentTrackIdRef.current !== trackId) return
      audio.src = albumTrackUrl(albumCode, trackId)
      audio.load()
      if (shouldPlay) audio.play().catch(() => {})
    } finally {
      if (currentTrackIdRef.current === trackId) setTrackLoading(false)
    }
  }, [albumCode, processTrack])

  const playTrack = useCallback((idx) => {
    const tracks = metaRef.current?.tracks
    if (!tracks) return
    setCurrentIdx(idx)
    setPlaying(true)
    loadTrack(tracks[idx].trackId, true)
    // Pre-fetch the next track so the transition is instant
    if (idx + 1 < tracks.length) processTrack(tracks[idx + 1].trackId).catch(() => {})
  }, [loadTrack, processTrack])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !meta) return
    if (!audio.src || audio.src === window.location.href) {
      playTrack(currentIdx)
      return
    }
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play().catch(() => {}); setPlaying(true) }
  }

  const currentTrack = meta?.tracks?.[currentIdx] ?? null

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
                        // Reuse cached blob URL if already processed
                        try {
                          const blobUrl = await processTrack(track.trackId)
                          const a = document.createElement('a')
                          a.href = blobUrl
                          a.download = `${track.title}.wav`
                          a.click()
                        } catch {
                          // Fallback: fetch and process independently
                          const blob = await fetch(albumTrackUrl(albumCode, track.trackId)).then(r => r.blob())
                          const a = document.createElement('a')
                          a.href = URL.createObjectURL(blob)
                          a.download = `${track.title}.webm`
                          a.click()
                          URL.revokeObjectURL(a.href)
                        }
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
