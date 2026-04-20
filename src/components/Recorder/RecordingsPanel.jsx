import { useState, useEffect, useCallback, useRef } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { AudioPlayer } from './AudioPlayer'
import { OPFSClient } from '../../lib/opfsClient'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  const numChannels = decoded.numberOfChannels
  const sampleRate = decoded.sampleRate
  const numSamples = decoded.length
  const wavBuffer = new ArrayBuffer(44 + numSamples * numChannels * 2)
  const view = new DataView(wavBuffer)

  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  const writeUint32 = (offset, val) => view.setUint32(offset, val, true)
  const writeUint16 = (offset, val) => view.setUint16(offset, val, true)

  const dataSize = numSamples * numChannels * 2
  writeStr(0, 'RIFF'); writeUint32(4, 36 + dataSize); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); writeUint32(16, 16); writeUint16(20, 1)
  writeUint16(22, numChannels); writeUint32(24, sampleRate)
  writeUint32(28, sampleRate * numChannels * 2); writeUint16(32, numChannels * 2)
  writeUint16(34, 16); writeStr(36, 'data'); writeUint32(40, dataSize)

  let offset = 44
  for (let s = 0; s < numSamples; s++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, decoded.getChannelData(c)[s]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return wavBuffer
}

export function RecordingsPanel({ isOpen, songId, onClose }) {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [quota, setQuota] = useState(null)
  const [playingSrc, setPlayingSrc] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const clientRef = useRef(null)
  const objectUrlsRef = useRef([])

  const load = useCallback(async () => {
    if (!isOpen || !songId) return
    setLoading(true)
    try {
      const [recs, q] = await Promise.all([
        clientRef.current.send('list-recordings', { songId }),
        clientRef.current.send('storage-quota'),
      ])
      setRecordings(recs)
      setQuota(q)
    } finally {
      setLoading(false)
    }
  }, [isOpen, songId])

  useEffect(() => {
    if (!isOpen) return
    const client = OPFSClient.create()
    clientRef.current = client
    load()
    return () => {
      objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
      objectUrlsRef.current = []
      client.terminate()
      clientRef.current = null
    }
  }, [isOpen, load])

  async function handlePlay(rec) {
    if (playingSrc?.recordingId === rec.recordingId) { setPlayingSrc(null); return }
    const buffer = await clientRef.current.send('read-audio', { songId, recordingId: rec.recordingId })
    const blob = new Blob([buffer], { type: rec.mimeType ?? 'audio/webm' })
    const url = URL.createObjectURL(blob)
    objectUrlsRef.current.push(url)
    setPlayingSrc({ recordingId: rec.recordingId, url, mimeType: rec.mimeType, durationMs: rec.duration })
  }

  async function handleDelete(rec) {
    if (!confirm(`Delete "${rec.name}"?`)) return
    await clientRef.current.send('delete-recording', { songId, recordingId: rec.recordingId })
    if (playingSrc?.recordingId === rec.recordingId) setPlayingSrc(null)
    await load()
  }

  async function handleDownload(rec) {
    const buffer = await clientRef.current.send('read-audio', { songId, recordingId: rec.recordingId })
    const blob = new Blob([buffer], { type: rec.mimeType ?? 'audio/webm' })
    let downloadBlob = blob
    let ext = 'webm'
    try {
      const wavBuffer = await blobToWav(blob)
      downloadBlob = new Blob([wavBuffer], { type: 'audio/wav' })
      ext = 'wav'
    } catch { /* AudioContext unavailable, fall back to raw */ }

    const url = URL.createObjectURL(downloadBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${rec.name.replace(/[^a-z0-9 _-]/gi, '_')}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleRenameSubmit(rec) {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    const { recordingId, ...rest } = rec
    await clientRef.current.send('write-meta', { songId, recordingId, meta: { ...rest, name: trimmed } })
    setRenamingId(null)
    await load()
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} title="Recordings" onClose={onClose}>
      <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
        {quota && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Storage: {formatBytes(quota.usedBytes)} used
            {quota.totalBytes > 0 && ` of ${formatBytes(quota.totalBytes)}`}
          </p>
        )}

        {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

        {!loading && recordings.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No recordings yet for this song.</p>
        )}

        {recordings.map(rec => (
          <div key={rec.recordingId} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {renamingId === rec.recordingId ? (
                  <form onSubmit={e => { e.preventDefault(); handleRenameSubmit(rec) }} className="flex gap-1">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      autoFocus
                      className="flex-1 text-sm px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Button type="submit" variant="primary" className="text-xs px-2 py-0.5">Save</Button>
                    <Button type="button" variant="ghost" onClick={() => setRenamingId(null)} className="text-xs px-2 py-0.5">✕</Button>
                  </form>
                ) : (
                  <>
                    <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{rec.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(rec.date)} · {formatBytes(rec.size)}</p>
                  </>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" className="text-xs px-1.5 py-0.5"
                  onClick={() => { setRenamingId(rec.recordingId); setRenameValue(rec.name) }}
                  aria-label={`Rename ${rec.name}`}>✏️</Button>
                <Button variant="ghost" className="text-xs px-1.5 py-0.5"
                  onClick={() => handleDownload(rec)}
                  aria-label={`Download ${rec.name}`}>↓ Download</Button>
                <Button variant="danger" className="text-xs px-1.5 py-0.5"
                  onClick={() => handleDelete(rec)}
                  aria-label={`Delete ${rec.name}`}>Delete</Button>
              </div>
            </div>

            {playingSrc?.recordingId === rec.recordingId ? (
              <AudioPlayer src={playingSrc.url} mimeType={playingSrc.mimeType} durationMs={playingSrc.durationMs} />
            ) : (
              <Button variant="secondary" className="text-xs self-start" onClick={() => handlePlay(rec)}>▶ Play</Button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
