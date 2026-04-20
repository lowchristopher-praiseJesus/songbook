import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioRecorder } from '../lib/audioRecorder'
import { OPFSClient } from '../lib/opfsClient'

const TIMER_INTERVAL_MS = 200

function defaultName(songTitle) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${songTitle} — ${date}`
}

export function useRecording({ songId, songTitle }) {
  const [status, setStatus] = useState('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [pendingName, setPendingName] = useState('')
  const [error, setError] = useState(null)

  const recorderRef = useRef(null)
  const clientRef = useRef(null)
  const recordingIdRef = useRef(null)
  const mimeTypeRef = useRef(null)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)
  const pausedElapsedRef = useRef(0)

  useEffect(() => {
    const client = OPFSClient.create()
    clientRef.current = client
    return () => {
      client.terminate()
      clientRef.current = null
    }
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
      setStatus('recording')
      startTimer()
    } catch (err) {
      setStatus('error')
      setError(err.message ?? String(err))
    }
  }, [songId])

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
      size: 0,
      mimeType: mimeTypeRef.current,
    }
    await clientRef.current?.send('write-meta', {
      songId,
      recordingId: recordingIdRef.current,
      meta,
    })
    resetTimer()
    setElapsedMs(0)
    setPendingName('')
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

  return { status, elapsedMs, pendingName, error, startRecording, pauseRecording, resumeRecording, stopRecording, saveRecording, cancelNaming }
}
