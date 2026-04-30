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
import { buildNavOrder } from '../../lib/collectionUtils'
import { useScrollSettings } from '../../hooks/useScrollSettings'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { formatDuration } from '../../lib/formatDuration'

export function MainContent({ onAddToast, lyricsOnly = false, fontSize = 16, onFontSizeChange, onImportSuccess }) {
  const activeSong = useLibraryStore(s => s.activeSong)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const selectSong = useLibraryStore(s => s.selectSong)
  const editingSongId = useLibraryStore(s => s.editingSongId)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)
  const viewMode = useLibraryStore(s => s.viewMode)
  const [performanceSections, setPerformanceSections] = useState(null)
  const [duplicateState, setDuplicateState] = useState(null)
  const [swipeHint, setSwipeHint] = useState(null)    // { title, direction: 'left'|'right' }
  const [swipeDir, setSwipeDir] = useState(null)      // 'left' | 'right' | null
  const hintTimerRef = useRef(null)
  const [chordsOpen, setChordsOpen] = useState(true)
  const [isFit, setIsFit] = useState(false)
  const [speedMode, setSpeedMode] = useState(false)
  const containerRef = useRef(null)
  const { targetDuration, setTargetDuration } = useScrollSettings(activeSongId)
  const { isScrolling, start, stop } = useAutoScroll(containerRef, targetDuration)

  useEffect(() => {
    if (!isScrolling) setSpeedMode(false)
  }, [isScrolling])

  const navOrder = buildNavOrder(index, collections, viewMode)
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
            Drop .sbp or ChordPro files here
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
                isFit={isFit}
                containerRef={containerRef}
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
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-20 pointer-events-auto items-center"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {speedMode ? (
            <>
              <button
                type="button"
                onClick={() => setTargetDuration(targetDuration + 5)}
                disabled={targetDuration >= 600}
                className="w-16 h-16 flex items-center justify-center rounded-full
                  bg-gray-500/25 dark:bg-white/15 text-gray-700 dark:text-gray-300
                  text-3xl font-light leading-none select-none
                  opacity-80 active:opacity-100 transition-opacity duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed"
                aria-label="Slower (increase scroll duration)"
              >+</button>
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono tabular-nums select-none">
                {formatDuration(targetDuration)}
              </span>
              <button
                type="button"
                onClick={() => setTargetDuration(targetDuration - 5)}
                disabled={targetDuration <= 30}
                className="w-16 h-16 flex items-center justify-center rounded-full
                  bg-gray-500/25 dark:bg-white/15 text-gray-700 dark:text-gray-300
                  text-3xl font-light leading-none select-none
                  opacity-80 active:opacity-100 transition-opacity duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed"
                aria-label="Faster (decrease scroll duration)"
              >−</button>
              <button
                type="button"
                onClick={() => setSpeedMode(false)}
                className="mt-1 px-4 py-2 rounded-full
                  bg-indigo-500/40 dark:bg-indigo-400/30
                  text-gray-800 dark:text-gray-200 text-sm font-medium select-none
                  opacity-80 active:opacity-100 transition-opacity duration-150"
                aria-label="Done adjusting speed"
              >Done</button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsFit(f => !f)}
                className={`w-11 h-11 flex items-center justify-center rounded-full
                  text-gray-700 dark:text-gray-300 text-sm leading-none select-none
                  active:opacity-100 transition-opacity duration-150
                  ${isFit
                    ? 'bg-indigo-500/50 dark:bg-indigo-400/40 opacity-80'
                    : 'bg-gray-500/30 dark:bg-white/20 opacity-50'
                  }`}
                aria-label="Fit song to screen"
              >⤢</button>
              <button
                type="button"
                onClick={() => onFontSizeChange(Math.min(fontSize + 2, 28))}
                disabled={fontSize >= 28 || isFit}
                className="w-11 h-11 flex items-center justify-center rounded-full
                  bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
                  text-lg font-light leading-none select-none
                  opacity-50 active:opacity-100 transition-opacity duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed"
                aria-label="Increase font size"
              >+</button>
              <button
                type="button"
                onClick={() => onFontSizeChange(Math.max(fontSize - 2, 12))}
                disabled={fontSize <= 12 || isFit}
                className="w-11 h-11 flex items-center justify-center rounded-full
                  bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
                  text-lg font-light leading-none select-none
                  opacity-50 active:opacity-100 transition-opacity duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed"
                aria-label="Decrease font size"
              >−</button>
              {isScrolling && (
                <button
                  type="button"
                  onClick={() => setSpeedMode(true)}
                  className="w-11 h-7 flex items-center justify-center rounded-full
                    bg-gray-500/20 dark:bg-white/10
                    text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums select-none
                    opacity-60 active:opacity-100 transition-opacity duration-150"
                  aria-label="Adjust scroll speed"
                >{formatDuration(targetDuration)}</button>
              )}
              <button
                type="button"
                onClick={isScrolling ? stop : () => { start(); setSpeedMode(true) }}
                className={`w-11 h-11 flex items-center justify-center rounded-full
                  text-gray-700 dark:text-gray-300 text-sm leading-none select-none
                  active:opacity-100 transition-opacity duration-150
                  ${isScrolling
                    ? 'bg-indigo-500/50 dark:bg-indigo-400/40 opacity-80'
                    : 'bg-gray-500/30 dark:bg-white/20 opacity-50'
                  }`}
                aria-label={isScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'}
              >{isScrolling ? '⏹' : '▶'}</button>
            </>
          )}
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
