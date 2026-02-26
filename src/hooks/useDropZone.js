// src/hooks/useDropZone.js
import { useState, useCallback } from 'react'

export function useDropZone(onFiles) {
  const [isDragging, setIsDragging] = useState(false)

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.sbp'))
    if (files.length > 0) onFiles(files)
  }, [onFiles])

  return { isDragging, onDragOver, onDragLeave, onDrop }
}
