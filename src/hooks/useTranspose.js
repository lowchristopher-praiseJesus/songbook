import { useState, useMemo, useCallback, useEffect } from 'react'
import { transposeSections } from '../lib/parser/chordUtils'
import { setTransposeState } from '../lib/storage'

export function useTranspose(sections, usesFlats, songId, defaultCapo = 0) {
  const [state, setState] = useState({
    songId,
    defaultCapo,
    delta: 0,
    capo: defaultCapo,
  })

  const stateMatchesSong = state.songId === songId && state.defaultCapo === defaultCapo
  const delta = stateMatchesSong ? state.delta : 0
  const capo = stateMatchesSong ? state.capo : defaultCapo

  // Start each newly selected song from its saved metadata. Transpose/capo
  // changes are still persisted for export, but reopening a song should not
  // make the header key drift away from the editor's saved key.
  useEffect(() => {
    if (!songId) return
    setTransposeState(songId, { delta, capo })
  }, [songId, delta, capo])

  const updateState = useCallback((updater) => {
    setState(prev => {
      const current = prev.songId === songId && prev.defaultCapo === defaultCapo
        ? prev
        : { songId, defaultCapo, delta: 0, capo: defaultCapo }
      return { ...current, ...updater(current) }
    })
  }, [songId, defaultCapo])

  const transposedSections = useMemo(
    () => transposeSections(sections ?? [], delta - capo, usesFlats ?? false),
    [sections, delta, capo, usesFlats]
  )

  const transposeUp   = useCallback(() => updateState(s => ({ delta: s.delta + 1 })), [updateState])
  const transposeDown = useCallback(() => updateState(s => ({ delta: s.delta - 1 })), [updateState])
  const reset         = useCallback(() => updateState(() => ({ delta: 0 })), [updateState])
  const transposeTo   = useCallback((newDelta) => updateState(() => ({ delta: newDelta })), [updateState])
  const capoUp        = useCallback(() => updateState(s => ({ capo: Math.min(s.capo + 1, 7) })), [updateState])
  const capoDown      = useCallback(() => updateState(s => ({ capo: Math.max(s.capo - 1, 0) })), [updateState])

  return { delta, capo, transposedSections, transposeUp, transposeDown, reset, transposeTo, capoUp, capoDown }
}
