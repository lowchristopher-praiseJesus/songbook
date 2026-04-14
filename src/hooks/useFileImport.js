import { useCallback, useRef, useEffect } from 'react'
import { parseSbpFile } from '../lib/parser/sbpParser'
import { parseChordPro } from '../lib/parser/chordProParser'
import { useLibraryStore } from '../store/libraryStore'

/**
 * Hook for importing .sbp files.
 * @param {Object} options
 * @param {Function} options.onError - Called with an error message string on failure
 * @param {Function} options.onDuplicateCheck - Called with title string, returns Promise<'replace'|'keep-both'|'skip'>
 */
export function useFileImport({ onError, onDuplicateCheck, onSuccess }) {
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
      const isSbp = /\.(sbp|sbpbackup)$/i.test(file.name)
      const isChordPro = /\.(cho|chordpro|chopro|pro)$/i.test(file.name)

      if (!isSbp && !isChordPro) {
        onError(`"${file.name}" is not a supported file (.sbp, .sbpbackup, .cho, .chordpro, .chopro, .pro)`)
        continue
      }
      try {
        let parsed
        if (isSbp) {
          const buf = await file.arrayBuffer()
          parsed = await parseSbpFile(buf)
        } else {
          const text = await file.text()
          const song = parseChordPro(text, file.name)
          parsed = { songs: [song], collectionName: null, lyricsOnly: false }
        }
        const fileBasedName = file.name.replace(/\.(sbp|sbpbackup|cho|chordpro|chopro|pro)$/i, '')
        const accepted = []

        for (const song of parsed.songs) {
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

          accepted.push(song)
        }

        if (accepted.length > 0) {
          try {
            const effectiveCollectionName = parsed.collectionName ?? (accepted.length > 1 ? fileBasedName : null)
            addSongs(accepted, effectiveCollectionName)
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
    onSuccess?.()
  }, [addSongs, replaceSong, onError, onDuplicateCheck, onSuccess])
  // index removed from deps — always read via indexRef

  return { importFiles }
}
