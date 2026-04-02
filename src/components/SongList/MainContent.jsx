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
import { SongEditor } from '../SongEditor/SongEditor'
import { buildGroups } from '../../lib/collectionUtils'
import { useScrollSettings } from '../../hooks/useScrollSettings'
import { useAutoScroll } from '../../hooks/useAutoScroll'

function formatDuration(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function MainContent({ onAddToast, lyricsOnly = false, fontSize = 16, onFontSizeChange, onImportSuccess }) {
  const activeSong = useLibraryStore(s => s.activeSong)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const selectSong = useLibraryStore(s => s.selectSong)
  const editingSongId = useLibraryStore(s => s.editingSongId)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)
  const [performanceSections, setPerformanceSections] = useState(null)
  const [duplicateState, setDuplicateState] = useState(null)
  const [swipeHint, setSwipeHint] = useState(null)    // { title, direction: 'left'|'right' }
  const [swipeDir, setSwipeDir] = useState(null)      // 'left' | 'right' | null
  const hintTimerRef = useRef(null)
  const [chordsOpen, setChordsOpen] = useState(true)
  const containerRef = useRef(null)
  const { targetDuration, setTargetDuration } = useScrollSettings(activeSongId)
  const { isScrolling, start, stop } = useAutoScroll(containerRef, targetDuration)

  const navOrder = buildGroups(index, collections).flatMap(g => g.entries)
  const currentIdx = navOrder.findIndex(e => e.id === activeSongId)
  const prevEntry = currentIdx > 0 ? navOrder[currentIdx - 1] : null
  const nextEntry = currentIdx < navOrder.length - 1 ? navOrder[currentIdx + 1] : null

  function showHint(title, direction) {
    clearTimeout(hintTimerRef.current)
    setSwipeHint({ title, direction })
    hintTimerRef.current = setTimeout(() => setSwipeHint(null), 1200)
  }

  useEffect(() => () => clearTimeout(hintTimerRef.current), [])

  useEffect(() => {
    if (isScrolling) stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSongId])

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
      if (performanceSections || editingSongId) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, performanceSections, editingSongId])

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

      {editingSongId
        ? <SongEditor songId={editingSongId} />
        : !activeSong
          ? <EmptyState onFileChange={handleFileInput} />
          : <div
              ref={containerRef}
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
                onEdit={() => setEditingSongId(activeSongId)}
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

      {/* Floating font-size + auto-scroll controls */}
      {activeSong && (
        <div className="fixed bottom-4 right-4 flex flex-col gap-1 z-20 pointer-events-auto"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <button
            type="button"
            onClick={() => onFontSizeChange(Math.min(fontSize + 2, 28))}
            disabled={fontSize >= 28}
            className="w-8 h-8 flex items-center justify-center rounded-full
              bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
              text-lg font-light leading-none select-none
              opacity-70 active:opacity-100 transition-opacity duration-150
              disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Increase font size"
          >+</button>
          <button
            type="button"
            onClick={() => onFontSizeChange(Math.max(fontSize - 2, 12))}
            disabled={fontSize <= 12}
            className="w-8 h-8 flex items-center justify-center rounded-full
              bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
              text-lg font-light leading-none select-none
              opacity-70 active:opacity-100 transition-opacity duration-150
              disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Decrease font size"
          >−</button>

          {isScrolling && (
            <>
              <div className="h-1" />
              <button
                type="button"
                onClick={() => setTargetDuration(targetDuration + 5)}
                disabled={targetDuration >= 600}
                className="w-8 h-8 flex items-center justify-center rounded-full
                  bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
                  text-lg font-light leading-none select-none
                  opacity-70 active:opacity-100 transition-opacity duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed"
                aria-label="Increase scroll duration"
              >+</button>
              <span className="w-8 h-6 flex items-center justify-center
                text-xs text-gray-500 dark:text-gray-400 font-mono select-none tabular-nums">
                {formatDuration(targetDuration)}
              </span>
              <button
                type="button"
                onClick={() => setTargetDuration(targetDuration - 5)}
                disabled={targetDuration <= 30}
                className="w-8 h-8 flex items-center justify-center rounded-full
                  bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
                  text-lg font-light leading-none select-none
                  opacity-70 active:opacity-100 transition-opacity duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed"
                aria-label="Decrease scroll duration"
              >−</button>
              <div className="h-1" />
            </>
          )}

          <button
            type="button"
            onClick={isScrolling ? stop : start}
            className={`w-8 h-8 flex items-center justify-center rounded-full
              text-gray-700 dark:text-gray-300 text-sm leading-none select-none
              active:opacity-100 transition-opacity duration-150
              ${isScrolling
                ? 'bg-indigo-500/50 dark:bg-indigo-400/40 opacity-90'
                : 'bg-gray-500/30 dark:bg-white/20 opacity-70'
              }`}
            aria-label={isScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'}
          >{isScrolling ? '⏹' : '▶'}</button>
        </div>
      )}

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
