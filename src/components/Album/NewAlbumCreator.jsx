import { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { OPFSClient } from '../../lib/opfsClient'
import { createAlbum, uploadTrack, saveAlbumLocally, updateAlbumMeta, updateAlbumCover, updateAlbumLocally, albumCoverUrl } from '../../lib/albumApi'
import { useLibraryStore } from '../../store/libraryStore'
import { v4 as uuidv4 } from 'uuid'

// Duration stored as milliseconds in album recordings
function formatDuration(ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function SortableTrackRow({ track, index, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.recordingId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors select-none ${
        isDragging
          ? 'opacity-50 border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 shadow-lg'
          : 'border-transparent bg-indigo-50 dark:bg-indigo-900/10 hover:bg-indigo-100 dark:hover:bg-indigo-900/25'
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing text-base leading-none select-none touch-none"
        aria-label="Drag to reorder"
      >⠿</span>
      <span className="text-xs text-gray-400 dark:text-gray-500 w-4 text-right tabular-nums shrink-0">{index + 1}</span>
      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{track.name}</span>
      {track.duration > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
          {formatDuration(track.duration)}
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(track.recordingId)}
        className="text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-500 transition-colors shrink-0 leading-none"
        aria-label={`Remove ${track.name}`}
      >✕</button>
    </div>
  )
}

export function NewAlbumCreator({ album = null }) {
  const isEditing = album !== null
  const setIsCreatingNewAlbum = useLibraryStore(s => s.setIsCreatingNewAlbum)
  const setActiveAlbumCode = useLibraryStore(s => s.setActiveAlbumCode)
  const syncAlbums = useLibraryStore(s => s.syncAlbums)
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)

  // Metadata
  const [title, setTitle] = useState(album?.title ?? '')
  const [artist, setArtist] = useState(album?.artist ?? '')
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(
    album?.hasCover ? albumCoverUrl(album.albumCode) : null
  )
  const fileInputRef = useRef(null)

  // Recording picker
  const [bysong, setBysong] = useState({})  // { [songId]: { song, recordings } }
  const [loadingRecs, setLoadingRecs] = useState(true)
  const [tab, setTab] = useState('collections')
  const clientRef = useRef(null)

  // Track order
  const [orderedTracks, setOrderedTracks] = useState(
    album?.tracks?.map(t => ({
      trackId: t.trackId,
      name: t.title,
      duration: t.duration,
      isExisting: true,
    })) ?? []
  )

  // Upload
  const [uploadPhase, setUploadPhase] = useState(null)  // null | 'uploading' | 'error'
  const [uploadProgress, setUploadProgress] = useState({ step: '', current: 0, total: 0 })
  const [uploadError, setUploadError] = useState(null)

  // dnd-kit sensors (same config as CollectionGroup)
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // OPFS client lifecycle
  useEffect(() => {
    clientRef.current = OPFSClient.create()
    return () => clientRef.current?.terminate()
  }, [])

  // Load recordings once on mount (creator is single-use; index captured via ref)
  const indexRef = useRef(index)
  useEffect(() => {
    const client = clientRef.current
    const snapshot = indexRef.current
    async function load() {
      setLoadingRecs(true)
      const result = {}
      for (const songEntry of snapshot) {
        try {
          const recs = await client.send('list-recordings', { songId: songEntry.id })
          if (recs.length > 0) result[songEntry.id] = { song: songEntry, recordings: recs }
        } catch { /* no recordings for this song */ }
      }
      setBysong(result)
      setLoadingRecs(false)
    }
    load()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke cover preview URL on unmount / change
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  // ── Metadata handlers ──────────────────────────────────────
  function handleCoverChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverPreview(URL.createObjectURL(file))
  }

  // ── Recording picker handlers ──────────────────────────────
  function isSelected(recordingId) {
    return orderedTracks.some(t => t.recordingId === recordingId)
  }

  function toggleRecording(song, rec) {
    if (isSelected(rec.recordingId)) {
      setOrderedTracks(prev => prev.filter(t => t.recordingId !== rec.recordingId))
    } else {
      setOrderedTracks(prev => [...prev, {
        songId: song.id,
        songTitle: song.title,
        recordingId: rec.recordingId,
        name: rec.name,
        duration: rec.duration ?? 0,
        mimeType: rec.mimeType ?? 'audio/webm',
      }])
    }
  }

  // ── Track order handlers ───────────────────────────────────
  function removeTrack(recordingId) {
    setOrderedTracks(prev => prev.filter(t => t.recordingId !== recordingId))
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setOrderedTracks(prev => {
      const oldIndex = prev.findIndex(t => t.recordingId === active.id)
      const newIndex = prev.findIndex(t => t.recordingId === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  // ── Publish ────────────────────────────────────────────────
  async function handlePublish() {
    if (uploadPhase === 'uploading' || orderedTracks.length === 0) return
    setUploadPhase('uploading')
    setUploadError(null)

    const client = clientRef.current
    const effectiveTitle = title.trim() || 'Untitled Album'
    const trackMeta = orderedTracks.map(t => ({
      trackId: uuidv4(),
      title: t.name,
      duration: t.duration,
      mimeType: t.mimeType,
      songId: t.songId,
      recordingId: t.recordingId,
    }))
    setUploadProgress({ step: 'Creating album…', current: 0, total: trackMeta.length })

    try {
      const { albumCode, creatorToken } = await createAlbum({
        title: effectiveTitle,
        artist: artist.trim(),
        coverFile: coverFile ?? null,
        tracks: trackMeta.map(({ trackId, title: t, duration, mimeType }) => ({ trackId, title: t, duration, mimeType })),
      })

      for (let i = 0; i < trackMeta.length; i++) {
        const { trackId, title: tTitle, mimeType, songId, recordingId } = trackMeta[i]
        setUploadProgress({ step: `Uploading "${tTitle}"…`, current: i + 1, total: trackMeta.length })
        const buffer = await client.send('read-audio', { songId, recordingId })
        await uploadTrack(albumCode, trackId, buffer, mimeType, creatorToken)
      }

      saveAlbumLocally({
        albumCode, creatorToken, title: effectiveTitle, artist: artist.trim(),
        tracks: trackMeta.map(({ trackId, title: t, duration }) => ({ trackId, title: t, duration })),
      })
      syncAlbums()
      setActiveAlbumCode(albumCode)
      setIsCreatingNewAlbum(false)
    } catch (err) {
      console.error('[NewAlbumCreator] upload error', err)
      setUploadError(err.message)
      setUploadPhase('error')
    }
  }

  function handleCancel() { setIsCreatingNewAlbum(false) }

  // ── Derived ────────────────────────────────────────────────
  const collectionsWithRecordings = collections
    .filter(col => col.songIds?.some(id => id in bysong))
    .map(col => ({
      col,
      entries: (col.songIds ?? []).filter(id => id in bysong).map(id => bysong[id]),
    }))

  const trackIds = orderedTracks.map(t => t.recordingId)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {isEditing ? 'Edit Album' : 'New Album'}
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 hidden sm:block">Select recordings, then publish.</p>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">

        {/* ── Left column ──────────────────────────────────── */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
          {uploadPhase === 'uploading' ? (
            <div className="flex flex-col items-center justify-center gap-5 p-8 flex-1">
              <div className="text-4xl animate-pulse">🎵</div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{uploadProgress.step}</p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: uploadProgress.total > 0 ? `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` : '0%' }}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {uploadProgress.current} of {uploadProgress.total} tracks
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 p-5 flex-1">
              {/* Metadata */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Album Details</p>
                <div className="flex gap-3 items-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-14 h-14 rounded-xl shrink-0 overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center group"
                    aria-label="Choose cover photo"
                  >
                    {coverPreview
                      ? <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                      : <span className="text-2xl">🎵</span>
                    }
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                      Edit
                    </div>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                  <div className="flex-1 flex flex-col gap-2">
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Album title…"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={artist}
                      onChange={e => setArtist(e.target.value)}
                      placeholder="Artist / group…"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Track order */}
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Track Order
                  {orderedTracks.length > 0 && (
                    <span className="ml-1 font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">
                      · drag ⠿ to reorder
                    </span>
                  )}
                </p>
                {orderedTracks.length === 0 ? (
                  <div className="flex items-center justify-center border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-400 dark:text-gray-500 py-8 text-center px-3">
                    <span className="hidden md:inline">Select recordings on the right →</span>
                    <span className="md:hidden">Tap a recording below to add it</span>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-1.5 overflow-y-auto">
                        {orderedTracks.map((t, i) => (
                          <SortableTrackRow
                            key={t.recordingId}
                            track={t}
                            index={i}
                            onRemove={removeTrack}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              {/* Error state */}
              {uploadPhase === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {uploadError ?? 'Upload failed.'} Check your connection and try again.
                </p>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
                <button
                  type="button"
                  disabled={orderedTracks.length === 0}
                  onClick={handlePublish}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isEditing ? 'Re-publish' : 'Publish Album'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: recording picker ────────────────── */}
        <div className="flex-1 flex flex-col gap-4 p-5 overflow-hidden min-h-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0">
            Select Recordings
          </p>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
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

          {loadingRecs ? (
            <div className="flex items-center justify-center flex-1 text-sm text-gray-400 dark:text-gray-500">
              Loading recordings…
            </div>
          ) : Object.keys(bysong).length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">No recordings found.</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Record songs using the Rec button, then come back.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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
                    <div className="space-y-1">
                      {entries.map(({ song, recordings }) => (
                        <div key={song.id}>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 px-3">
                            {song.title}
                          </p>
                          {recordings.map(rec => (
                            <label
                              key={rec.recordingId}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                isSelected(rec.recordingId)
                                  ? 'bg-indigo-50 dark:bg-indigo-900/20'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected(rec.recordingId)}
                                onChange={() => toggleRecording(song, rec)}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{rec.name}</span>
                              {rec.duration > 0 && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                                  {formatDuration(rec.duration)}
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {tab === 'songs' && Object.values(bysong).map(({ song, recordings }) => (
                <div key={song.id}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    {song.title}
                  </p>
                  <div className="space-y-1">
                    {recordings.map(rec => (
                      <label
                        key={rec.recordingId}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected(rec.recordingId)
                            ? 'bg-indigo-50 dark:bg-indigo-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected(rec.recordingId)}
                          onChange={() => toggleRecording(song, rec)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{rec.name}</span>
                        {rec.duration > 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                            {formatDuration(rec.duration)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
