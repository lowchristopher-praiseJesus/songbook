/**
 * OPFS Storage Worker
 * Message protocol:
 *   IN:  { type, requestId, ...payload }
 *   OUT: { requestId, ok: true, result } | { requestId, ok: false, error: string }
 *
 * Types: write-chunk, finalize-recording, write-meta, read-meta,
 *        list-recordings, delete-recording, read-audio, storage-quota
 */

const openHandles = new Map()

function reply(requestId, result) {
  self.postMessage({ requestId, ok: true, result })
}

function replyError(requestId, error) {
  self.postMessage({ requestId, ok: false, error: String(error) })
}

async function getDir(root, ...segments) {
  let dir = root
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true })
  }
  return dir
}

async function getRecordingDir(root, songId, recordingId) {
  return getDir(root, 'recordings', songId, recordingId)
}

self.onmessage = async (e) => {
  const { type, requestId, ...payload } = e.data
  try {
    const root = await navigator.storage.getDirectory()

    switch (type) {
      case 'write-audio': {
        const { songId, recordingId, buffer } = payload
        const dir = await getRecordingDir(root, songId, recordingId)
        const fileHandle = await dir.getFileHandle('audio.webm', { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(new Uint8Array(buffer))
        await writable.close()
        reply(requestId, { ok: true })
        break
      }

      case 'write-chunk': {
        const { songId, recordingId, buffer } = payload
        const key = `${songId}/${recordingId}`
        const dir = await getRecordingDir(root, songId, recordingId)
        const fileHandle = await dir.getFileHandle('audio.webm', { create: true })

        let entry = openHandles.get(key)
        if (!entry) {
          const syncHandle = await fileHandle.createSyncAccessHandle()
          entry = { syncHandle, offset: 0 }
          openHandles.set(key, entry)
        }
        const view = new Uint8Array(buffer)
        entry.syncHandle.write(view, { at: entry.offset })
        entry.offset += view.length
        entry.syncHandle.flush()
        reply(requestId, { bytesWritten: view.length, totalSize: entry.offset })
        break
      }

      case 'finalize-recording': {
        const { songId, recordingId } = payload
        const key = `${songId}/${recordingId}`
        const entry = openHandles.get(key)
        if (entry) {
          entry.syncHandle.flush()
          entry.syncHandle.close()
          openHandles.delete(key)
        }
        reply(requestId, { ok: true })
        break
      }

      case 'write-meta': {
        const { songId, recordingId, meta } = payload
        const dir = await getRecordingDir(root, songId, recordingId)
        const fileHandle = await dir.getFileHandle('meta.json', { create: true })
        const syncHandle = await fileHandle.createSyncAccessHandle()
        const encoded = new TextEncoder().encode(JSON.stringify(meta))
        syncHandle.truncate(0)
        syncHandle.write(encoded, { at: 0 })
        syncHandle.flush()
        syncHandle.close()
        reply(requestId, { ok: true })
        break
      }

      case 'read-meta': {
        const { songId, recordingId } = payload
        const dir = await getRecordingDir(root, songId, recordingId)
        const fileHandle = await dir.getFileHandle('meta.json')
        const file = await fileHandle.getFile()
        const text = await file.text()
        reply(requestId, JSON.parse(text))
        break
      }

      case 'list-recordings': {
        const { songId } = payload
        const recordingsRoot = await getDir(root, 'recordings', songId)
        const results = []
        for await (const [name, handle] of recordingsRoot.entries()) {
          if (handle.kind === 'directory') {
            try {
              const metaHandle = await handle.getFileHandle('meta.json')
              const file = await metaHandle.getFile()
              const text = await file.text()
              results.push({ recordingId: name, ...JSON.parse(text) })
            } catch {
              // skip recordings with missing meta
            }
          }
        }
        results.sort((a, b) => new Date(b.date) - new Date(a.date))
        reply(requestId, results)
        break
      }

      case 'delete-recording': {
        const { songId, recordingId } = payload
        const key = `${songId}/${recordingId}`
        const entry = openHandles.get(key)
        if (entry) {
          entry.syncHandle.close()
          openHandles.delete(key)
        }
        const songDir = await getDir(root, 'recordings', songId)
        await songDir.removeEntry(recordingId, { recursive: true })
        reply(requestId, { ok: true })
        break
      }

      case 'read-audio': {
        const { songId, recordingId } = payload
        const dir = await getRecordingDir(root, songId, recordingId)
        const fileHandle = await dir.getFileHandle('audio.webm')
        const file = await fileHandle.getFile()
        const buffer = await file.arrayBuffer()
        self.postMessage({ requestId, ok: true, result: buffer }, [buffer])
        break
      }

      case 'storage-quota': {
        const estimate = await navigator.storage.estimate()
        reply(requestId, { usedBytes: estimate.usage ?? 0, totalBytes: estimate.quota ?? 0 })
        break
      }

      default:
        replyError(requestId, `Unknown message type: ${type}`)
    }
  } catch (err) {
    replyError(requestId, err.message ?? String(err))
  }
}
