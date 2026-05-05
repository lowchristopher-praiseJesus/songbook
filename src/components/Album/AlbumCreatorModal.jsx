import { useState, useRef, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { OPFSClient } from '../../lib/opfsClient'
import { createAlbum, uploadTrack, saveAlbumLocally, albumTrackUrl } from '../../lib/albumApi'
import { useLibraryStore } from '../../store/libraryStore'
import { v4 as uuidv4 } from 'uuid'

function formatDuration(ms) {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── Step 1: Select recordings ────────────────────────────────────────────────

function StepSelectRecordings({ onNext }) {
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const [bysong, setBysong] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('collections')
  const clientRef = useRef(null)

  useEffect(() => {
    clientRef.current = OPFSClient.create()
    return () => clientRef.current?.terminate()
  }, [])

  useEffect(() => {
    const client = clientRef.current
    async function load() {
      setLoading(true)
      const result = {}
      for (const songEntry of index) {
        try {
          const recs = await client.send('list-recordings', { songId: songEntry.id })
          if (recs.length > 0) {
            result[songEntry.id] = {
              song: songEntry,
              recordings: recs,
              selected: new Set(),
            }
          }
        } catch { /* no recordings */ }
      }
      setBysong(result)
      setLoading(false)
    }
    load()
  }, [index])

  function toggleRecording(songId, recordingId) {
    setBysong(prev => {
      const entry = prev[songId]
      const next = new Set(entry.selected)
      next.has(recordingId) ? next.delete(recordingId) : next.add(recordingId)
      return { ...prev, [songId]: { ...entry, selected: next } }
    })
  }

  function selectAll() {
    setBysong(prev => Object.fromEntries(
      Object.entries(prev).map(([id, entry]) => [
        id, { ...entry, selected: new Set(entry.recordings.map(r => r.recordingId)) }
      ])
    ))
  }

  function unselectAll() {
    setBysong(prev => Object.fromEntries(
      Object.entries(prev).map(([id, entry]) => [id, { ...entry, selected: new Set() }])
    ))
  }

  const tracks = []
  for (const { song, recordings, selected } of Object.values(bysong)) {
    for (const rec of recordings) {
      if (selected.has(rec.recordingId)) {
        tracks.push({ songId: song.id, songTitle: song.title, ...rec })
      }
    }
  }

  const collectionsWithRecordings = collections
    .filter(col => col.songIds?.some(id => id in bysong))
    .map(col => ({
      col,
      entries: (col.songIds ?? []).filter(id => id in bysong).map(id => bysong[id]),
    }))

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm">
      Loading recordings…
    </div>
  )

  if (Object.keys(bysong).length === 0) return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-4">
      <p className="text-gray-500 dark:text-gray-400 text-sm">No recordings found in your library.</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Record songs using the Rec button on any song, then come back.
      </p>
    </div>
  )

  const totalRecordings = Object.values(bysong).reduce((n, e) => n + e.recordings.length, 0)
  const allSelected = tracks.length === totalRecordings

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select recordings to include in your album.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={selectAll}
            disabled={allSelected}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Select all
          </button>
          <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
          <button
            type="button"
            onClick={unselectAll}
            disabled={tracks.length === 0}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Unselect all
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {['collections', 'songs'].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              tab === t
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'collections' ? 'Collections' : 'Songs'}
          </button>
        ))}
      </div>

      <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
        {tab === 'collections' && (
          collectionsWithRecordings.length === 0 ? (
            <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-8">
              No collections have recordings yet.
            </p>
          ) : collectionsWithRecordings.map(({ col, entries }) => (
            <div key={col.id ?? col.name}>
              <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide mb-2">
                {col.name}
              </p>
              <div className="space-y-3">
                {entries.map(({ song, recordings, selected }) => (
                  <div key={song.id}>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 px-3">
                      {song.title}
                    </p>
                    <div className="space-y-1">
                      {recordings.map(rec => (
                        <label
                          key={rec.recordingId}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
                            hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(rec.recordingId)}
                            onChange={() => toggleRecording(song.id, rec.recordingId)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
                            {rec.name}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                            {formatDuration(rec.duration)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {tab === 'songs' && Object.values(bysong).map(({ song, recordings, selected }) => (
          <div key={song.id}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              {song.title}
            </p>
            <div className="space-y-1">
              {recordings.map(rec => (
                <label
                  key={rec.recordingId}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
                    hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(rec.recordingId)}
                    onChange={() => toggleRecording(song.id, rec.recordingId)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
                    {rec.name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                    {formatDuration(rec.duration)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''} selected
        </span>
        <Button onClick={() => onNext(tracks)} disabled={tracks.length === 0}>
          Next →
        </Button>
      </div>
    </div>
  )
}

// ── Step 2: Album details ────────────────────────────────────────────────────

function StepAlbumDetails({ defaultTitle, defaultArtist, onNext, onBack }) {
  const [title, setTitle] = useState(defaultTitle)
  const [artist, setArtist] = useState(defaultArtist)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const fileInputRef = useRef(null)

  function handleCoverChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    const url = URL.createObjectURL(file)
    setCoverPreview(url)
  }

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Enter your album details.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Album Title
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Judah 29 April 2026"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600
              px-3 py-2 text-sm bg-white dark:bg-gray-800
              text-gray-900 dark:text-gray-100
              focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Artist / Group Name
          </label>
          <input
            value={artist}
            onChange={e => setArtist(e.target.value)}
            placeholder="e.g. SMTB Judah"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600
              px-3 py-2 text-sm bg-white dark:bg-gray-800
              text-gray-900 dark:text-gray-100
              focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Cover Photo <span className="text-gray-400">(optional)</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300
                transition-colors"
            >
              {coverFile ? 'Change photo…' : 'Choose photo…'}
            </button>
            {coverPreview && (
              <img
                src={coverPreview}
                alt="Cover preview"
                className="h-14 w-14 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
              />
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverChange}
          />
        </div>
      </div>

      <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <Button onClick={() => onNext({ title: title.trim() || 'Untitled Album', artist: artist.trim(), coverFile })}>
          Create Album →
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: Uploading ────────────────────────────────────────────────────────

function StepUploading({ tracks, details, onDone, onError, onClose }) {
  const [progress, setProgress] = useState({ step: 'Creating album…', current: 0, total: tracks.length })
  const [hasError, setHasError] = useState(false)
  const clientRef = useRef(OPFSClient.create())
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const client = clientRef.current
    ;(async () => {
      const trackMeta = tracks.map(t => ({
        trackId: uuidv4(),
        title: t.name,
        duration: t.duration,
        mimeType: t.mimeType ?? 'audio/webm',
        songId: t.songId,
        recordingId: t.recordingId,
      }))

      const { albumCode, creatorToken } = await createAlbum({
        title: details.title,
        artist: details.artist,
        coverFile: details.coverFile ?? null,
        tracks: trackMeta.map(({ trackId, title, duration, mimeType }) => ({ trackId, title, duration, mimeType })),
      })

      for (let i = 0; i < trackMeta.length; i++) {
        const { trackId, title, mimeType, songId, recordingId } = trackMeta[i]
        setProgress({ step: `Uploading "${title}"…`, current: i + 1, total: trackMeta.length })
        const buffer = await client.send('read-audio', { songId, recordingId })
        await uploadTrack(albumCode, trackId, buffer, mimeType, creatorToken)
      }

      saveAlbumLocally({
        albumCode, creatorToken, title: details.title, artist: details.artist,
        tracks: trackMeta.map(({ trackId, title, duration }) => ({ trackId, title, duration })),
      })
      client.terminate()
      onDone({ albumCode, creatorToken })
    })().catch(err => {
      console.error('[AlbumCreator] upload error', err)
      setHasError(true)
      onError()
      setProgress(p => ({ ...p, step: `Error: ${err.message}` }))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      <div className="text-4xl animate-pulse">🎵</div>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{progress.step}</p>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">
        {progress.current} of {progress.total} tracks uploaded
      </p>
      {hasError && (
        <Button variant="secondary" onClick={onClose}>Close</Button>
      )}
    </div>
  )
}

// ── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone({ albumCode, onClose }) {
  const albumUrl = `${window.location.origin}${window.location.pathname}?album=${albumCode}`
  const [copied, setCopied] = useState(false)
  const qrRef = useRef(null)

  useEffect(() => {
    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, albumUrl, { width: 180, margin: 2 }).catch(() => {})
    }
  }, [albumUrl])

  function handleCopy() {
    navigator.clipboard.writeText(albumUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="text-3xl">🎉</div>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Your album is live!</p>

      <canvas ref={qrRef} className="rounded-lg" />

      <div className="w-full flex gap-2">
        <input
          readOnly
          value={albumUrl}
          className="flex-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600
            px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300
            focus:outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-2 text-xs rounded-lg bg-indigo-600 text-white
            hover:bg-indigo-700 transition-colors shrink-0"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="flex gap-3 w-full">
        <a
          href={albumUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center text-xs px-3 py-2 rounded-lg border border-indigo-600 text-indigo-600
            hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
        >
          Open Album ↗
        </a>
        <Button onClick={onClose} className="flex-1">Done</Button>
      </div>
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function AlbumCreatorModal({ isOpen, onClose }) {
  const [step, setStep] = useState('select')
  const [tracks, setTracks] = useState([])
  const [details, setDetails] = useState(null)
  const [result, setResult] = useState(null)
  const [uploadError, setUploadError] = useState(false)

  useEffect(() => {
    if (isOpen) { setStep('select'); setTracks([]); setDetails(null); setResult(null); setUploadError(false) }
  }, [isOpen])

  const stepTitles = { select: 'Select Recordings', details: 'Album Details', uploading: 'Creating Album', done: 'Album Created' }

  return (
    <Modal isOpen={isOpen} onClose={(step === 'uploading' && !uploadError) ? undefined : onClose} title={stepTitles[step] ?? 'Create Album'}>
      <div className="w-full max-w-md">
        {step === 'select' && (
          <StepSelectRecordings
            onNext={selected => { setTracks(selected); setStep('details') }}
          />
        )}
        {step === 'details' && (
          <StepAlbumDetails
            defaultTitle=""
            defaultArtist=""
            onNext={d => { setDetails(d); setStep('uploading') }}
            onBack={() => setStep('select')}
          />
        )}
        {step === 'uploading' && (
          <StepUploading
            tracks={tracks}
            details={details}
            onDone={r => { setResult(r); setStep('done') }}
            onError={() => setUploadError(true)}
            onClose={onClose}
          />
        )}
        {step === 'done' && (
          <StepDone albumCode={result.albumCode} onClose={onClose} />
        )}
      </div>
    </Modal>
  )
}
