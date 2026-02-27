import { useRef, useState, useCallback, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useDropZone } from '../../hooks/useDropZone'
import { useFileImport } from '../../hooks/useFileImport'
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation'
import { EmptyState } from './EmptyState'
import { SongList } from './SongList'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { PerformanceModal } from '../PerformanceMode/PerformanceModal'

export function MainContent({ onAddToast, lyricsOnly = false, fontSize = 16, onFontSizeChange, onImportSuccess }) {
  const activeSong = useLibraryStore(s => s.activeSong)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const index = useLibraryStore(s => s.index)
  const selectSong = useLibraryStore(s => s.selectSong)
  const fileInputRef = useRef()
  const [performanceSections, setPerformanceSections] = useState(null)
  const [duplicateState, setDuplicateState] = useState(null)
  const [swipeHint, setSwipeHint] = useState(null)    // { title, direction: 'left'|'right' }
  const [swipeDir, setSwipeDir] = useState(null)      // 'left' | 'right' | null
  const hintTimerRef = useRef(null)
  const [chordsOpen, setChordsOpen] = useState(true)

  const currentIdx = index.findIndex(e => e.id === activeSongId)
  const prevEntry = currentIdx > 0 ? index[currentIdx - 1] : null
  const nextEntry = currentIdx < index.length - 1 ? index[currentIdx + 1] : null

  function showHint(title, direction) {
    clearTimeout(hintTimerRef.current)
    setSwipeHint({ title, direction })
    hintTimerRef.current = setTimeout(() => setSwipeHint(null), 1200)
  }

  useEffect(() => () => clearTimeout(hintTimerRef.current), [])

  const goNext = useCallback(() => {
    if (!nextEntry) return
    setSwipeDir('left')
    selectSong(nextEntry.id)
    showHint(nextEntry.title, 'left')
  }, [nextEntry, selectSong])

  const goPrev = useCallback(() => {
    if (!prevEntry) return
    setSwipeDir('right')
    selectSong(prevEntry.id)
    showHint(prevEntry.title, 'right')
  }, [prevEntry, selectSong])

  const { onTouchStart, onTouchEnd } = useSwipeNavigation({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  })

  // Desktop arrow-key navigation (skip when a modal is open or user is typing)
  useEffect(() => {
    function onKey(e) {
      if (performanceSections) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, performanceSections])

  function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  function resolveDuplicate(resolution) {
    const { resolve } = duplicateState
    setDuplicateState(null)
    resolve(resolution)
  }

  const { importFiles } = useFileImport({
    onError: msg => onAddToast(msg, 'error'),
    onDuplicateCheck,
    onSuccess: onImportSuccess,
  })

  const { isDragging, onDragOver, onDragLeave, onDrop } = useDropZone(importFiles)

  const handleClosePerformance = useCallback(() => setPerformanceSections(null), [])

  function handleFileInput(e) {
    importFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  return (
    <main
      className={`flex-1 overflow-y-auto relative transition-colors
        ${isDragging ? 'ring-4 ring-indigo-400 ring-inset bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 bg-white/80 dark:bg-gray-900/80 px-6 py-3 rounded-xl">
            Drop .sbp files here
          </div>
        </div>
      )}

      {!activeSong
        ? <EmptyState onImport={() => fileInputRef.current?.click()} />
        : <div
            key={activeSongId}
            className={`h-full overflow-x-hidden
              ${swipeDir === 'left'  ? 'animate-slideFromRight' : ''}
              ${swipeDir === 'right' ? 'animate-slideFromLeft'  : ''}
            `}
            onAnimationEnd={() => setSwipeDir(null)}
          >
            <SongList
              song={activeSong}
              onPerformanceMode={setPerformanceSections}
              lyricsOnly={lyricsOnly}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              chordsOpen={chordsOpen}
              onChordsToggle={() => setChordsOpen(o => !o)}
            />
          </div>
      }

      {/* Swipe navigation hint */}
      {swipeHint && (
        <div
          key={swipeHint.title}
          className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2
            px-4 py-2 rounded-full bg-gray-900/80 dark:bg-gray-100/80
            text-white dark:text-gray-900 text-sm font-medium
            animate-[fadeInOut_1.2s_ease-in-out_forwards] z-40 whitespace-nowrap max-w-xs truncate"
        >
          {swipeHint.direction === 'left' ? '→ ' : '← '}{swipeHint.title}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".sbp,*/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Duplicate resolution modal */}
      <Modal
        isOpen={!!duplicateState}
        title="Duplicate Song"
        onClose={() => resolveDuplicate('skip')}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          A song titled "{duplicateState?.title}" already exists. What would you like to do?
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="danger" onClick={() => resolveDuplicate('replace')}>Replace</Button>
          <Button variant="secondary" onClick={() => resolveDuplicate('keep-both')}>Keep Both</Button>
          <Button variant="ghost" onClick={() => resolveDuplicate('skip')}>Skip</Button>
        </div>
      </Modal>

      {performanceSections && activeSong && (
        <PerformanceModal song={activeSong} sections={performanceSections} lyricsOnly={lyricsOnly} onClose={handleClosePerformance} />
      )}
    </main>
  )
}
