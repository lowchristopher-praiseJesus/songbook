import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

const KEY = 'songsheet_scroll_durations' // map of { [songId]: seconds }
const DEFAULT = 90
const MIN = 30
const MAX = 600

export function useScrollSettings(songId) {
  const [durationsMap, setDurationsMap] = useLocalStorage(KEY, {})

  const targetDuration = songId ? (durationsMap[songId] ?? DEFAULT) : DEFAULT

  const setTargetDuration = useCallback((val) => {
    if (!songId) return
    const clamped = Math.min(MAX, Math.max(MIN, val))
    setDurationsMap({ ...durationsMap, [songId]: clamped })
  }, [songId, durationsMap, setDurationsMap])

  return { targetDuration, setTargetDuration }
}
