import { useState, useEffect, useRef } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import {
  fetchConductorStatus, startBroadcast, setCurrentSong,
  stopBroadcast, joinBroadcast, sendFollowerHeartbeat, leaveBroadcast,
} from '../lib/conductorApi'

// Backoff delays for WAITING phase (ms): 5s, 10s, 20s, 40s, 80s, 160s, then cap at 300s
const BACKOFF_MS = [5000, 10000, 20000, 40000, 80000, 160000, 300000]
const LIVE_INTERVAL_MS = 3000
const PRE_BROADCAST_WINDOW_MS = 30 * 60 * 1000

function getClientId() {
  let id = sessionStorage.getItem('conductor_client_id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('conductor_client_id', id)
  }
  return id
}

export function useConductorSync({ conductorCode, conductorToken, broadcastTime, activeSongSbpId, onAddToast }) {
  const index = useLibraryStore(s => s.index)
  const selectSong = useLibraryStore(s => s.selectSong)

  const [live, setLive] = useState(false)
  const [currentSbpId, setCurrentSbpId] = useState(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  // 'dormant' → 'waiting' → 'live' → 'ended'  (one-way)
  const [phase, setPhase] = useState('dormant')

  const isConductor = !!conductorToken
  const phaseRef = useRef('dormant')
  const backoffIndexRef = useRef(0)
  const timerRef = useRef(null)
  const heartbeatRef = useRef(null)
  const prevSbpIdRef = useRef(null)

  function clearTimer() {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  function scheduleNextPoll(delayMs) {
    clearTimer()
    timerRef.current = setTimeout(() => executePollRef.current?.(), delayMs)
  }

  // Ref-based callback so it always closes over the latest render values
  const executePollRef = useRef(null)
  executePollRef.current = async function executePoll() {
    if (!conductorCode || phaseRef.current === 'ended' || phaseRef.current === 'dormant') return

    try {
      const status = await fetchConductorStatus(conductorCode)
      const wasLive = phaseRef.current === 'live'

      setLive(status.live)
      setFollowerCount(status.followerCount)

      if (status.currentSbpId !== prevSbpIdRef.current) {
        prevSbpIdRef.current = status.currentSbpId
        setCurrentSbpId(status.currentSbpId)
      }

      if (status.live) {
        phaseRef.current = 'live'
        setPhase('live')
        backoffIndexRef.current = 0
        scheduleNextPoll(LIVE_INTERVAL_MS)
      } else if (wasLive) {
        // Director stopped — session over, stop polling
        phaseRef.current = 'ended'
        setPhase('ended')
        setIsFollowing(false)
        setLive(false)
      } else {
        // Still waiting — advance backoff
        const idx = Math.min(backoffIndexRef.current, BACKOFF_MS.length - 1)
        backoffIndexRef.current = Math.min(backoffIndexRef.current + 1, BACKOFF_MS.length - 1)
        scheduleNextPoll(BACKOFF_MS[idx])
      }
    } catch (err) {
      if (err.code === 'expired' || err.code === 'not_found') {
        phaseRef.current = 'ended'
        setPhase('ended')
        setLive(false)
        setIsFollowing(false)
      } else if (phaseRef.current !== 'ended') {
        // Network error — retry with current schedule
        const delay = phaseRef.current === 'live'
          ? LIVE_INTERVAL_MS
          : BACKOFF_MS[Math.min(backoffIndexRef.current, BACKOFF_MS.length - 1)]
        scheduleNextPoll(delay)
      }
    }
  }

  // Main scheduling effect — determines initial phase and starts the state machine
  useEffect(() => {
    if (!conductorCode) return

    function startWaiting() {
      phaseRef.current = 'waiting'
      setPhase('waiting')
      backoffIndexRef.current = 0
      executePollRef.current?.()
    }

    if (broadcastTime) {
      const msUntilWindow = new Date(broadcastTime).getTime() - Date.now() - PRE_BROADCAST_WINDOW_MS
      if (msUntilWindow > 0) {
        phaseRef.current = 'dormant'
        setPhase('dormant')
        timerRef.current = setTimeout(startWaiting, msUntilWindow)
        return () => clearTimer()
      }
    }

    startWaiting()
    return () => clearTimer()
  }, [conductorCode, broadcastTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pause poll when tab is hidden; resume when visible (don't touch dormant timer)
  useEffect(() => {
    if (!conductorCode) return
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        if (phaseRef.current === 'waiting' || phaseRef.current === 'live') clearTimer()
      } else if (phaseRef.current === 'waiting' || phaseRef.current === 'live') {
        executePollRef.current?.()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [conductorCode])

  // Conductor: broadcast song when activeSongSbpId changes
  useEffect(() => {
    if (!isConductor || !live || activeSongSbpId == null || !conductorCode) return
    setCurrentSong(conductorCode, activeSongSbpId, conductorToken).catch(() => {})
  }, [activeSongSbpId, isConductor, live, conductorCode, conductorToken])

  // Follower: navigate when currentSbpId changes
  useEffect(() => {
    if (!isFollowing || currentSbpId == null) return
    const entry = index.find(e => e.sbpId === currentSbpId)
    if (entry) {
      selectSong(entry.id)
    } else {
      onAddToast?.("Conductor switched to a song not in your library", 'info')
    }
  }, [currentSbpId, isFollowing]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStartBroadcast() {
    if (!conductorCode || !conductorToken) return
    try {
      await startBroadcast(conductorCode, conductorToken)
      setLive(true)
      if (activeSongSbpId != null) {
        await setCurrentSong(conductorCode, activeSongSbpId, conductorToken)
      }
    } catch { /* ignore */ }
  }

  async function handleStopBroadcast() {
    if (!conductorCode || !conductorToken) return
    try {
      await stopBroadcast(conductorCode, conductorToken)
      setLive(false)
    } catch { /* ignore */ }
  }

  async function handleFollowDirector() {
    if (!conductorCode) return
    const clientId = getClientId()
    try {
      await joinBroadcast(conductorCode, clientId)
      setIsFollowing(true)
      if (currentSbpId != null) {
        const entry = index.find(e => e.sbpId === currentSbpId)
        if (entry) selectSong(entry.id)
      }
      heartbeatRef.current = setInterval(() => {
        sendFollowerHeartbeat(conductorCode, clientId).catch(() => {})
      }, 60_000)
    } catch (err) {
      if (err.code === 'full') {
        onAddToast?.("Broadcast is full — try again later", 'error')
      }
    }
  }

  async function handleStopFollowing() {
    if (!conductorCode) return
    const clientId = getClientId()
    clearInterval(heartbeatRef.current)
    heartbeatRef.current = null
    setIsFollowing(false)
    leaveBroadcast(conductorCode, clientId).catch(() => {})
  }

  return {
    live,
    phase,
    broadcastTime,
    currentSbpId,
    followerCount,
    isFollowing,
    isBroadcasting: isConductor && live,
    isConductor,
    conductorCode,
    startBroadcast: handleStartBroadcast,
    stopBroadcast: handleStopBroadcast,
    followDirector: handleFollowDirector,
    stopFollowing: handleStopFollowing,
  }
}
