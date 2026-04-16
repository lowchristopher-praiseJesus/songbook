import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { fetchSessionState, sendHeartbeat } from '../lib/sessionApi'

export function useSessionSync({ code, onEnded, onLockLost }) {
  // onLockLost({ songId, hadConflict, theirRawText, localRawText })
  // called when the active edit lock disappears from poll state
  const applyServerState = useSessionStore(s => s.applyServerState)
  const pollRef = useRef(null)
  const heartbeatRef = useRef(null)
  const activeLockRef = useRef(null) // { songId, clientId, localRawText } | null

  const poll = useCallback(async () => {
    if (!code) return
    try {
      const state = await fetchSessionState(code)
      if (state.closed || new Date(state.expiresAt).getTime() <= Date.now()) {
        onEnded?.()
        return
      }

      // Detect lost lock: we had a lock but it no longer appears for our clientId
      if (activeLockRef.current) {
        const { songId, clientId, localRawText } = activeLockRef.current
        const lock = state.editLocks[songId]
        const stillMine = lock && lock.clientId === clientId && new Date(lock.expiresAt).getTime() > Date.now()
        if (!stillMine) {
          const theirRawText = state.songs[songId]?.rawText ?? ''
          const hadConflict = theirRawText !== localRawText
          activeLockRef.current = null
          clearInterval(heartbeatRef.current)
          onLockLost?.({ songId, hadConflict, theirRawText, localRawText })
        }
      }

      applyServerState(state)
    } catch (err) {
      if (err.code === 'expired' || err.code === 'not_found') {
        onEnded?.()
      }
      // Other errors: silently skip this cycle
    }
  }, [code, applyServerState, onEnded, onLockLost])

  useEffect(() => {
    if (!code) return
    poll()

    function startPolling() {
      pollRef.current = setInterval(poll, 4000)
    }

    startPolling()

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        clearInterval(pollRef.current)
      } else {
        poll()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [code, poll])

  // localRawText is the song's rawText at the moment editing began — used for conflict detection
  function startHeartbeat(songId, clientId, localRawText) {
    activeLockRef.current = { songId, clientId, localRawText }
    clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(async () => {
      if (!activeLockRef.current || !code) return
      try {
        await sendHeartbeat(code, activeLockRef.current.songId, activeLockRef.current.clientId)
      } catch {
        // Lock expired — next poll will reflect it
      }
    }, 30_000)
  }

  function stopHeartbeat() {
    activeLockRef.current = null
    clearInterval(heartbeatRef.current)
    heartbeatRef.current = null
  }

  return { startHeartbeat, stopHeartbeat }
}
