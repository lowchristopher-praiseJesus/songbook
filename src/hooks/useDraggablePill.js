import { useRef, useState, useEffect, useCallback } from 'react'

const MARGIN = 8

function readStoredPosition(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed
    return null
  } catch {
    return null
  }
}

function clamp(next, pillEl) {
  const width = pillEl?.offsetWidth ?? 0
  const height = pillEl?.offsetHeight ?? 0
  const maxX = Math.max(MARGIN, window.innerWidth - width - MARGIN)
  const maxY = Math.max(MARGIN, window.innerHeight - height - MARGIN)
  return {
    x: Math.max(MARGIN, Math.min(maxX, next.x)),
    y: Math.max(MARGIN, Math.min(maxY, next.y)),
  }
}

export function useDraggablePill(storageKey) {
  const pillRef = useRef(null)
  const activeDragRef = useRef(null)
  const [position, setPosition] = useState(() => readStoredPosition(storageKey))

  useEffect(() => () => {
    if (activeDragRef.current) {
      window.removeEventListener('pointermove', activeDragRef.current.onMove)
      window.removeEventListener('pointerup', activeDragRef.current.onUp)
    }
  }, [])

  const startDrag = useCallback((e) => {
    e.preventDefault()
    const rect = pillRef.current.getBoundingClientRect()
    const startClientX = e.clientX
    const startClientY = e.clientY
    const startLeft = rect.left
    const startTop = rect.top

    function onMove(ev) {
      const deltaX = ev.clientX - startClientX
      const deltaY = ev.clientY - startClientY
      setPosition(clamp({ x: startLeft + deltaX, y: startTop + deltaY }, pillRef.current))
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      activeDragRef.current = null
      setPosition(prev => {
        if (prev) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(prev))
          } catch (err) {
            console.warn('useDraggablePill write failed:', err)
          }
        }
        return prev
      })
    }

    activeDragRef.current = { onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [storageKey])

  return { pillRef, position, gripProps: { onPointerDown: startDrag } }
}
