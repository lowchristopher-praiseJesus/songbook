import { useCallback, useRef, useEffect } from 'react'
import JSZip from 'jszip'
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
    let lastResult = { newSongIds: [], collectionId: null }

    for (const file of files) {
      const isSbp = /\.(sbp|sbpbackup)$/i.test(file.name)
      const isChordPro = /\.(cho|chordpro|chopro|pro|zip)$/i.test(file.name)

      if (!isSbp && !isChordPro) {
        onError(`"${file.name}" is not a supported file (.sbp, .sbpbackup, .cho, .pro, .zip)`)
        continue
      }
      try {
        let parsed
        if (isSbp) {
          const buf = await file.arrayBuffer()
          parsed = await parseSbpFile(buf)
        } else {
          const buf = await file.arrayBuffer()
          const magic = new Uint8Array(buf, 0, 2)
          const isZip = magic[0] === 0x50 && magic[1] === 0x4B  // PK

          if (isZip) {
            // ZIP of .cho files — e.g. exported by this app's ChordPro export
            const zip = await JSZip.loadAsync(buf)
            const songs = []
            for (const [entryName, entry] of Object.entries(zip.files)) {
              if (entry.dir) continue
              if (!/\.(cho|chordpro|chopro|pro)$/i.test(entryName)) continue
              const text = await entry.async('string')
              songs.push(parseChordPro(text, entryName))
            }
            const collectionName = file.name.replace(/\.zip$/i, '') || null
            parsed = { songs, collectionName, lyricsOnly: false }
          } else {
            const text = new TextDecoder().decode(buf)
            const song = parseChordPro(text, file.name)
            parsed = { songs: [song], collectionName: null, lyricsOnly: false }
          }
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
            const result = addSongs(accepted, effectiveCollectionName)
            lastResult = {
              newSongIds: [...lastResult.newSongIds, ...result.newSongIds],
              collectionId: lastResult.collectionId ?? result.collectionId,
            }
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
    onSuccess?.(lastResult)
  }, [addSongs, replaceSong, onError, onDuplicateCheck, onSuccess])
  // index removed from deps — always read via indexRef

  return { importFiles }
}
