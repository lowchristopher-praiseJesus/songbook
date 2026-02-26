import { useCallback, useRef, useEffect } from 'react'
import { parseSbpFile } from '../lib/parser/sbpParser'
import { useLibraryStore } from '../store/libraryStore'

/**
 * Hook for importing .sbp files.
 * @param {Object} options
 * @param {Function} options.onError - Called with an error message string on failure
 * @param {Function} options.onDuplicateCheck - Called with title string, returns Promise<'replace'|'keep-both'|'skip'>
 */
export function useFileImport({ onError, onDuplicateCheck }) {
  const addSongs = useLibraryStore(s => s.addSongs)
  const replaceSong = useLibraryStore(s => s.replaceSong)
  const index = useLibraryStore(s => s.index)

  // Use a ref for index so importFiles closure always reads the latest value
  const indexRef = useRef(index)
  useEffect(() => {
    indexRef.current = index
  }, [index])

  const importFiles = useCallback(async (files) => {
    for (const file of files) {
      if (!file.name.endsWith('.sbp')) {
        onError(`"${file.name}" is not a .sbp file`)
        continue
      }
      try {
        const buf = await file.arrayBuffer()
        const songs = await parseSbpFile(buf)

        for (const song of songs) {
          const duplicate = indexRef.current.find(e => e.title === song.meta.title)

          if (duplicate) {
            const resolution = await onDuplicateCheck(song.meta.title)
            if (resolution === 'replace') {
              replaceSong(duplicate.id, song)
              continue
            } else if (resolution === 'skip') {
              continue
            }
            // 'keep-both' falls through — addSongs will assign a new UUID
          }

          try {
            addSongs([song])
          } catch (e) {
            if (e.name === 'QuotaExceededError') {
              onError('Storage is full. Please delete some songs before importing more.')
              return
            }
            throw e
          }
        }
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          onError('Storage is full. Please delete some songs before importing more.')
          return
        }
        console.error('Import error:', e)
        onError(`Could not read "${file.name}". It may be corrupted or use an unsupported format.`)
      }
    }
  }, [addSongs, replaceSong, onError, onDuplicateCheck])
  // index removed from deps — always read via indexRef

  return { importFiles }
}
