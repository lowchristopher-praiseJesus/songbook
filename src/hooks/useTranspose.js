// src/hooks/useTranspose.js
import { useState, useMemo, useCallback } from 'react'
import { transposeSections } from '../lib/parser/chordUtils'

export function useTranspose(sections, usesFlats) {
  const [delta, setDelta] = useState(0)
  const [capo, setCapo] = useState(0)

  const transposedSections = useMemo(
    () => transposeSections(sections ?? [], delta - capo, usesFlats ?? false),
    [sections, delta, capo, usesFlats]
  )

  const transposeUp = useCallback(() => setDelta(d => d + 1), [])
  const transposeDown = useCallback(() => setDelta(d => d - 1), [])
  const reset = useCallback(() => setDelta(0), [])
  const transposeTo = useCallback((newDelta) => setDelta(newDelta), [])
  const capoUp = useCallback(() => setCapo(c => Math.min(c + 1, 7)), [])
  const capoDown = useCallback(() => setCapo(c => Math.max(c - 1, 0)), [])

  return { delta, capo, transposedSections, transposeUp, transposeDown, reset, transposeTo, capoUp, capoDown }
}
