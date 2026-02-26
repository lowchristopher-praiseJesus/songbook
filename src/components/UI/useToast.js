import { useState, useCallback, useEffect, useRef } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef({})

  // Clear all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [])

  const addToast = useCallback((message, type = 'error') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    timersRef.current[id] = setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id))
      delete timersRef.current[id]
    }, 4000)
  }, [])

  return { toasts, addToast }
}
