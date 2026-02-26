// src/hooks/useTranspose.js
import { useState, useMemo, useCallback } from 'react'
import { transposeSections } from '../lib/parser/chordUtils'

export function useTranspose(sections, usesFlats) {
  const [delta, setDelta] = useState(0)

  const transposedSections = useMemo(
    () => transposeSections(sections ?? [], delta, usesFlats ?? false),
    [sections, delta, usesFlats]
  )

  const transposeUp = useCallback(() => setDelta(d => d + 1), [])
  const transposeDown = useCallback(() => setDelta(d => d - 1), [])
  const reset = useCallback(() => setDelta(0), [])

  return { delta, transposedSections, transposeUp, transposeDown, reset }
}
