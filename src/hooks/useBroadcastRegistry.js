import { useLibraryStore } from '../store/libraryStore'

/**
 * Returns conductor-enabled collections split by ended status,
 * plus helpers for mutating broadcast state.
 */
export function useBroadcastRegistry() {
  const collections = useLibraryStore(s => s.collections)
  const clearBroadcastFields = useLibraryStore(s => s.clearBroadcastFields)
  const updateCollection = useLibraryStore(s => s.updateCollection)

  const broadcasts = collections.filter(c => c.conductorCode && !c.conductorEnded)
  const endedBroadcasts = collections.filter(c => c.conductorCode && c.conductorEnded)

  function forgetBroadcast(collectionId) {
    clearBroadcastFields(collectionId)
  }

  function markEnded(collectionId) {
    updateCollection(collectionId, { conductorEnded: true })
  }

  return { broadcasts, endedBroadcasts, forgetBroadcast, markEnded }
}
