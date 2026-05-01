import { useState, useEffect, useRef, useCallback } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import {
  fetchConductorStatus, startBroadcast, setCurrentSong,
  stopBroadcast, joinBroadcast, sendFollowerHeartbeat, leaveBroadcast,
} from '../lib/conductorApi'

function getClientId() {
  let id = sessionStorage.getItem('conductor_client_id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('conductor_client_id', id)
  }
  return id
}

export function useConductorSync({ conductorCode, directorToken, activeSongSbpId, onAddToast }) {
  const index = useLibraryStore(s => s.index)
  const selectSong = useLibraryStore(s => s.selectSong)

  const [live, setLive] = useState(false)
  const [currentSbpId, setCurrentSbpId] = useState(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isBroadcasting, setIsBroadcasting] = useState(false)

  const isDirector = !!directorToken
  const pollRef = useRef(null)
  const heartbeatRef = useRef(null)
  const prevSbpIdRef = useRef(null)

  const poll = useCallback(async () => {
    if (!conductorCode) return
    try {
      const status = await fetchConductorStatus(conductorCode)
      setLive(status.live)
      setFollowerCount(status.followerCount)
      if (status.currentSbpId !== prevSbpIdRef.current) {
        prevSbpIdRef.current = status.currentSbpId
        setCurrentSbpId(status.currentSbpId)
      }
      if (!status.live) setIsFollowing(false)
    } catch {
      // Network errors silently skipped
    }
  }, [conductorCode])

  // 1-second poll
  useEffect(() => {
    if (!conductorCode) return
    poll()
    function startPolling() { pollRef.current = setInterval(poll, 1000) }
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
  }, [conductorCode, poll])

  // Director: broadcast song when activeSongSbpId changes
  useEffect(() => {
    if (!isDirector || !isBroadcasting || !activeSongSbpId || !conductorCode) return
    setCurrentSong(conductorCode, activeSongSbpId, directorToken).catch(() => {})
  }, [activeSongSbpId, isDirector, isBroadcasting, conductorCode, directorToken])

  // Follower: navigate when currentSbpId changes
  useEffect(() => {
    if (!isFollowing || currentSbpId == null) return
    const entry = index.find(e => e.sbpId === currentSbpId)
    if (entry) {
      selectSong(entry.id)
    } else {
      onAddToast?.("Director switched to a song not in your library", 'info')
    }
  }, [currentSbpId, isFollowing]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStartBroadcast() {
    if (!conductorCode || !directorToken) return
    try {
      await startBroadcast(conductorCode, directorToken)
      setIsBroadcasting(true)
      setLive(true)
      if (activeSongSbpId) {
        await setCurrentSong(conductorCode, activeSongSbpId, directorToken)
      }
    } catch { /* ignore */ }
  }

  async function handleStopBroadcast() {
    if (!conductorCode || !directorToken) return
    try {
      await stopBroadcast(conductorCode, directorToken)
      setIsBroadcasting(false)
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
    currentSbpId,
    followerCount,
    isFollowing,
    isBroadcasting,
    isDirector,
    startBroadcast: handleStartBroadcast,
    stopBroadcast: handleStopBroadcast,
    followDirector: handleFollowDirector,
    stopFollowing: handleStopFollowing,
  }
}
