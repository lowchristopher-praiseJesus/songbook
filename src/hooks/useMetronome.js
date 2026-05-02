import { useState, useEffect, useRef } from 'react'

export function useMetronome(bpm, enabled) {
  const [isFlashing, setIsFlashing] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const shouldRun = enabled && bpm > 0

    if (!shouldRun) {
      clearInterval(intervalRef.current)
      clearTimeout(timeoutRef.current)
      intervalRef.current = null
      timeoutRef.current = null
      setIsFlashing(false)
      return
    }

    const ms = 60000 / bpm

    function tick() {
      setIsFlashing(true)
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setIsFlashing(false), 100)
    }

    intervalRef.current = setInterval(tick, ms)

    return () => {
      clearInterval(intervalRef.current)
      clearTimeout(timeoutRef.current)
    }
  }, [enabled, bpm])

  return { isFlashing }
}
