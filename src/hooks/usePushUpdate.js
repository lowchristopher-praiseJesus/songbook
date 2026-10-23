import { useState, useCallback } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { pushCollectionUpdate } from '../lib/pushCollectionUpdate'

/**
 * One-click Push Update for an already-shared collection, reporting the
 * outcome via toast. Uses the collection's stored name and lyrics-only flag;
 * the Share via link modal remains the place to change those or the lock.
 *
 * @param {{ onAddToast: Function, onExpired?: Function }} options
 * @returns {{ push: (collection: object) => Promise<void>, pushing: boolean }}
 */
export function usePushUpdate({ onAddToast, onExpired = () => {} }) {
  const recordSharePush = useLibraryStore(s => s.recordSharePush)
  const [pushing, setPushing] = useState(false)

  const push = useCallback(async (collection) => {
    if (!collection?.shareCode || pushing) return
    setPushing(true)
    try {
      const result = await pushCollectionUpdate(collection)
      recordSharePush(collection.id, { version: result.version, shareLyricsOnly: collection.shareLyricsOnly ?? false })
      onAddToast(`Pushed update (v${result.version})`, 'success')
    } catch (err) {
      if (err.code === 'locked') {
        onAddToast('This link is locked. Unlock it in Share via link before pushing updates.', 'error')
      } else if (err.code === 'expired') {
        onExpired()
        onAddToast('This share link has expired.', 'error')
      } else {
        onAddToast('Update failed. Please check your connection and try again.', 'error')
      }
    } finally {
      setPushing(false)
    }
  }, [pushing, recordSharePush, onAddToast, onExpired])

  return { push, pushing }
}
