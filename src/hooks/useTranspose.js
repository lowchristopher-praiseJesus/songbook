// src/hooks/useTranspose.js
import { useState, useMemo } from 'react'
import { transposeSections } from '../lib/parser/chordUtils'

export function useTranspose(sections, usesFlats) {
  const [delta, setDelta] = useState(0)

  const transposedSections = useMemo(
    () => transposeSections(sections ?? [], delta, usesFlats ?? false),
    [sections, delta, usesFlats]
  )

  return {
    delta,
    transposedSections,
    transposeUp: () => setDelta(d => d + 1),
    transposeDown: () => setDelta(d => d - 1),
    reset: () => setDelta(0),
  }
}
