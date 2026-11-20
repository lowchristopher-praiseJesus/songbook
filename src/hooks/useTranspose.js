import { useMemo, useCallback, useEffect } from 'react'
import { transposeSections } from '../lib/parser/chordUtils'
import { setTransposeState } from '../lib/storage'
import { useTransposeStore } from '../store/transposeStore'

export function useTranspose(sections, usesFlats, songId, defaultCapo = 0) {
  // Shared store, not component state: Full Screen and the normal view are
  // separate component instances (and Performance mode is opened from either),
  // so a key change must survive the view being remounted for the same song.
  const state = useTransposeStore(s => s.current)
  const setCurrent = useTransposeStore(s => s.setCurrent)

  const stateMatchesSong = state?.songId === songId && state?.defaultCapo === defaultCapo
  const delta = stateMatchesSong ? state.delta : 0
  const capo = stateMatchesSong ? state.capo : defaultCapo

  // Opening a different song starts it from its saved metadata: drop the
  // previous song's transpose so returning to it later doesn't resurrect it.
  useEffect(() => {
    if (!songId) return
    const current = useTransposeStore.getState().current
    if (current && (current.songId !== songId || current.defaultCapo !== defaultCapo)) {
      setCurrent(null)
    }
  }, [songId, defaultCapo, setCurrent])

  // Transpose/capo changes are still persisted for export (Sidebar export,
  // pushCollectionUpdate read them back).
  useEffect(() => {
    if (!songId) return
    setTransposeState(songId, { delta, capo })
  }, [songId, delta, capo])

  const updateState = useCallback((updater) => {
    const prev = useTransposeStore.getState().current
    const current = prev && prev.songId === songId && prev.defaultCapo === defaultCapo
      ? prev
      : { songId, defaultCapo, delta: 0, capo: defaultCapo }
    setCurrent({ ...current, ...updater(current) })
  }, [songId, defaultCapo, setCurrent])

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
