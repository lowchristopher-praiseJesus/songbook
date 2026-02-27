import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { transposeSections } from '../lib/parser/chordUtils'
import { getTransposeState, setTransposeState } from '../lib/storage'

export function useTranspose(sections, usesFlats, songId) {
  // Always-current ref so the save effect never captures a stale songId
  const songIdRef = useRef(songId)
  songIdRef.current = songId

  const [delta, setDelta] = useState(0)
  const [capo, setCapo] = useState(0)

  // Load persisted transpose state whenever the active song changes
  useEffect(() => {
    if (!songId) { setDelta(0); setCapo(0); return }
    const saved = getTransposeState(songId)
    setDelta(saved?.delta ?? 0)
    setCapo(saved?.capo ?? 0)
  }, [songId])

  // Persist whenever delta or capo change due to user interaction.
  // Intentionally omits songId from deps — songIdRef.current is always current,
  // and we only want to fire on actual value changes (not on song switch).
  useEffect(() => {
    const id = songIdRef.current
    if (!id) return
    setTransposeState(id, { delta, capo })
  }, [delta, capo]) // eslint-disable-line react-hooks/exhaustive-deps

  const transposedSections = useMemo(
    () => transposeSections(sections ?? [], delta - capo, usesFlats ?? false),
    [sections, delta, capo, usesFlats]
  )

  const transposeUp   = useCallback(() => setDelta(d => d + 1), [])
  const transposeDown = useCallback(() => setDelta(d => d - 1), [])
  const reset         = useCallback(() => setDelta(0), [])
  const transposeTo   = useCallback((newDelta) => setDelta(newDelta), [])
  const capoUp        = useCallback(() => setCapo(c => Math.min(c + 1, 7)), [])
  const capoDown      = useCallback(() => setCapo(c => Math.max(c - 1, 0)), [])

  return { delta, capo, transposedSections, transposeUp, transposeDown, reset, transposeTo, capoUp, capoDown }
}
