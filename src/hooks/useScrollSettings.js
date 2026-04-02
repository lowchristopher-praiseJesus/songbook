import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

const KEY = 'songsheet_scroll_duration'
const DEFAULT = 90
const MIN = 30
const MAX = 600

export function useScrollSettings() {
  const [targetDuration, setRaw] = useLocalStorage(KEY, DEFAULT)

  const setTargetDuration = useCallback((val) => {
    setRaw(Math.min(MAX, Math.max(MIN, val)))
  }, [setRaw])

  return { targetDuration, setTargetDuration }
}
