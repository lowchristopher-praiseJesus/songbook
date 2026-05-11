import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioRecorder } from '../lib/audioRecorder'
import { OPFSClient } from '../lib/opfsClient'
import { useRecordingStore } from '../store/recordingStore'

const TIMER_INTERVAL_MS = 200

export function recordingErrorMessage(err) {
  const name = err?.name ?? ''
  const message = err?.message ?? String(err ?? '')

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone access was blocked. Enable microphone permission for this site in your browser settings, then try recording again.'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect a microphone or choose a device with microphone access, then try again.'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone is already in use or could not be started. Close other apps using the microphone, then try again.'
  }

  if (name === 'SecurityError') {
    return 'Recording is blocked by this browser. Open SongSheet over HTTPS and allow microphone access for this site.'
  }

  return message || 'Recording could not start. Check microphone access and try again.'
}

function defaultName(songTitle) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${songTitle} — ${date}`
}

export function useRecording({ songId, songTitle }) {
  const [status, setStatus] = useState('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [pendingName, setPendingName] = useState('')
  const [error, setError] = useState(null)
  const [channels, setChannels] = useState(null)
  const [recordingCount, setRecordingCount] = useState(0)

  const recorderRef = useRef(null)
  const clientRef = useRef(null)
  const recordingIdRef = useRef(null)
  const mimeTypeRef = useRef(null)
  const sizeRef = useRef(0)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)
  const pausedElapsedRef = useRef(0)
  const statusRef = useRef('idle')

  useEffect(() => {
    const client = OPFSClient.create()
    clientRef.current = client
    return () => {
      client.terminate()
      clientRef.current = null
    }
  }, [])

  const refreshRecordingCount = useCallback(async () => {
    if (!songId || !clientRef.current) {
      setRecordingCount(0)
      return
    }

    try {
      const recs = await clientRef.current.send('list-recordings', { songId })
      setRecordingCount(Array.isArray(recs) ? recs.length : 0)
    } catch {
      setRecordingCount(0)
    }
  }, [songId])

  useEffect(() => {
    if (!songId || !clientRef.current) return

    let cancelled = false
    async function loadRecordingCount() {
      try {
        const recs = await clientRef.current.send('list-recordings', { songId })
        if (!cancelled) setRecordingCount(Array.isArray(recs) ? recs.length : 0)
      } catch {
        if (!cancelled) setRecordingCount(0)
      }
    }
    loadRecordingCount()
    return () => { cancelled = true }
  }, [songId])

  useEffect(() => {
    statusRef.current = status
    useRecordingStore.getState().setRecordingState(status, elapsedMs)
  }, [status, elapsedMs])

  useEffect(() => {
    return () => {
      if (statusRef.current === 'recording' || statusRef.current === 'paused') {
        recorderRef.current?.stop()
        clearInterval(timerRef.current)
      }
      useRecordingStore.getState().setRecordingState('idle', 0)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecordingsChange = useCallback((count) => {
    setRecordingCount(Math.max(0, count))
  }, [])

  function startTimer() {
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedMs(pausedElapsedRef.current + (Date.now() - startTimeRef.current))
    }, TIMER_INTERVAL_MS)
  }

  function pauseTimer() {
    clearInterval(timerRef.current)
    pausedElapsedRef.current += Date.now() - (startTimeRef.current ?? Date.now())
  }

  function resetTimer() {
    clearInterval(timerRef.current)
    pausedElapsedRef.current = 0
    startTimeRef.current = null
  }

  const startRecording = useCallback(async () => {
    setStatus('requesting')
    setError(null)
    setElapsedMs(0)
    recordingIdRef.current = crypto.randomUUID()

    const recorder = new AudioRecorder()
    recorderRef.current = recorder

    try {
      await recorder.start()
      mimeTypeRef.current = recorder.mimeType
      setChannels(recorder.channels)
      setStatus('recording')
      startTimer()
    } catch (err) {
      setStatus('error')
      setError(recordingErrorMessage(err))
      recorderRef.current = null
    }
  }, [])

  const pauseRecording = useCallback(() => {
    recorderRef.current?.pause()
    pauseTimer()
    setStatus('paused')
  }, [])

  const resumeRecording = useCallback(() => {
    recorderRef.current?.resume()
    startTimer()
    setStatus('recording')
  }, [])

  const stopRecording = useCallback(async () => {
    pauseTimer()
    const chunks = await recorderRef.current?.stop() ?? []
    if (chunks.length > 0) {
      const buffers = await Promise.all(chunks.map(c => c.arrayBuffer()))
      const totalBytes = buffers.reduce((sum, b) => sum + b.byteLength, 0)
      sizeRef.current = totalBytes
      const combined = new Uint8Array(totalBytes)
      let offset = 0
      for (const buf of buffers) { combined.set(new Uint8Array(buf), offset); offset += buf.byteLength }
      await clientRef.current?.sendTransfer('write-audio', {
        songId,
        recordingId: recordingIdRef.current,
        buffer: combined.buffer,
      }, [combined.buffer])
    }
    setPendingName(defaultName(songTitle))
    setStatus('naming')
  }, [songId, songTitle])

  const saveRecording = useCallback(async (name) => {
    const meta = {
      name: name.trim() || defaultName(songTitle),
      date: new Date().toISOString(),
      duration: elapsedMs,
      size: sizeRef.current,
      mimeType: mimeTypeRef.current,
    }
    await clientRef.current?.send('write-meta', {
      songId,
      recordingId: recordingIdRef.current,
      meta,
    })
    setRecordingCount(count => Math.max(count, 1))
    resetTimer()
    setElapsedMs(0)
    setPendingName('')
    setChannels(null)
    recorderRef.current = null
    setStatus('idle')
  }, [songId, songTitle, elapsedMs])

  const cancelNaming = useCallback(() => {
    resetTimer()
    setElapsedMs(0)
    setPendingName('')
    recorderRef.current = null
    setStatus('idle')
  }, [])

  const dismissError = useCallback(() => {
    setError(null)
    setChannels(null)
    setStatus('idle')
  }, [])

  return {
    status,
    elapsedMs,
    pendingName,
    error,
    channels,
    recordingCount,
    hasRecordings: recordingCount > 0,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    saveRecording,
    cancelNaming,
    dismissError,
    refreshRecordingCount,
    handleRecordingsChange,
  }
}
