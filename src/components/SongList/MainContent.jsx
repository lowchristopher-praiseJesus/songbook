import { useRef, useState, useCallback, useEffect } from 'react'
import { ArrowsPointingOutIcon, ArrowsPointingInIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import { useLibraryStore } from '../../store/libraryStore'
import { useDropZone } from '../../hooks/useDropZone'
import { useFileImport } from '../../hooks/useFileImport'
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation'
import { EmptyState } from './EmptyState'
import { SongView } from './SongView'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { PerformanceModal } from '../PerformanceMode/PerformanceModal'
import { SongEditor } from '../SongEditor/SongEditor'
import { NewSongEditor } from '../SongEditor/NewSongEditor'
import { buildNavOrder } from '../../lib/collectionUtils'
import { useScrollSettings } from '../../hooks/useScrollSettings'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { formatDuration } from '../../lib/formatDuration'
import metronomeIcon from '../../assets/metronome.png'
import swipeIcon from '../../assets/swipe.png'
import { AlbumDetailView } from '../Album/AlbumDetailView'
import { NewAlbumCreator } from '../Album/NewAlbumCreator'
import { CollectionDetailView } from '../Collection/CollectionDetailView'
import { NewCollectionCreator } from '../Collection/NewCollectionCreator'

export function MainContent({ onAddToast, lyricsOnly = false, fontSize = 16, onFontSizeChange, onImportSuccess, onOpenSidebar, metronomeEnabled, onMetronomeToggle, metronomeBpm = 120, onMetronomeBpmChange }) {
  const activeSong = useLibraryStore(s => s.activeSong)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const selectSong = useLibraryStore(s => s.selectSong)
  const editingSongId = useLibraryStore(s => s.editingSongId)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)
  const isCreatingNewSong = useLibraryStore(s => s.isCreatingNewSong)
  const isCreatingNewAlbum = useLibraryStore(s => s.isCreatingNewAlbum)
  const isCreatingNewCollection = useLibraryStore(s => s.isCreatingNewCollection)
  const editingAlbum = useLibraryStore(s => s.editingAlbum)
  const viewMode = useLibraryStore(s => s.viewMode)
  const activeCollectionId = useLibraryStore(s => s.activeCollectionId)
  const activeAlbumCode = useLibraryStore(s => s.activeAlbumCode)
  const selectedCollectionId = useLibraryStore(s => s.selectedCollectionId)
  const albums = useLibraryStore(s => s.albums)
  const activeAlbum = activeAlbumCode ? albums.find(a => a.albumCode === activeAlbumCode) ?? null : null
  const [performanceSections, setPerformanceSections] = useState(null)
  const [duplicateState, setDuplicateState] = useState(null)
  const [swipeHint, setSwipeHint] = useState(null)    // { title, direction: 'left'|'right' }
  const [swipeDir, setSwipeDir] = useState(null)      // 'left' | 'right' | null
  const [swipeHintVisible, setSwipeHintVisible] = useState(
    () => !localStorage.getItem('songsheet_swipe_hint_seen')
  )
  const hintTimerRef = useRef(null)
  const [chordsOpen, setChordsOpen] = useState(true)
  const [isFit, setIsFit] = useState(false)
  const [speedMode, setSpeedMode] = useState(false)
  const [bpmMode, setBpmMode] = useState(false)
  const containerRef = useRef(null)
  const { targetDuration, setTargetDuration } = useScrollSettings(activeSongId)
  const { isScrolling, start, stop } = useAutoScroll(containerRef, targetDuration)

  useEffect(() => {
    if (!isScrolling) setSpeedMode(false)
  }, [isScrolling])

  useEffect(() => {
    if (!metronomeEnabled) setBpmMode(false)
  }, [metronomeEnabled])

  // Draggable pill position — persisted to localStorage
  const [pillTop, setPillTop] = useState(() => {
    const saved = localStorage.getItem('songsheet_pill_top')
    return saved !== null ? Number(saved) : null
  })
  const pillRef = useRef(null)
  const activeDragRef = useRef(null)

  useEffect(() => () => {
    if (activeDragRef.current) {
      window.removeEventListener('pointermove', activeDragRef.current.onMove)
      window.removeEventListener('pointerup', activeDragRef.current.onUp)
    }
  }, [])

  function startPillDrag(e) {
    e.preventDefault()
    const rect = pillRef.current.getBoundingClientRect()
    const startClientY = e.clientY
    const startTop = rect.top

    function onMove(ev) {
      const delta = ev.clientY - startClientY
      const newTop = startTop + delta
      const pillHeight = pillRef.current?.offsetHeight ?? 240
      const clamped = Math.max(8, Math.min(window.innerHeight - pillHeight - 8, newTop))
      setPillTop(clamped)
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      activeDragRef.current = null
      setPillTop(prev => {
        if (prev !== null) localStorage.setItem('songsheet_pill_top', String(Math.round(prev)))
        return prev
      })
    }

    activeDragRef.current = { onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const navOrder = buildNavOrder(index, collections, viewMode, activeCollectionId)
  const currentIdx = navOrder.findIndex(e => e.id === activeSongId)
  const prevEntry = currentIdx > 0 ? navOrder[currentIdx - 1] : null
  const nextEntry = currentIdx < navOrder.length - 1 ? navOrder[currentIdx + 1] : null
  const inCollection = !!activeSong && !!activeCollectionId
    && !performanceSections && !editingSongId && !isCreatingNewSong && !selectedCollectionId

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

  function dismissSwipeHint() {
    localStorage.setItem('songsheet_swipe_hint_seen', '1')
    setSwipeHintVisible(false)
  }

  const goNext = useCallback(() => {
    if (!nextEntry) return
    setSwipeDir('left')
    selectSong(nextEntry.id)
    showHint(nextEntry.title, 'left')
    dismissSwipeHint()
  }, [nextEntry, selectSong])

  const goPrev = useCallback(() => {
    if (!prevEntry) return
    setSwipeDir('right')
    selectSong(prevEntry.id)
    showHint(prevEntry.title, 'right')
    dismissSwipeHint()
  }, [prevEntry, selectSong])

  const { onTouchStart, onTouchEnd } = useSwipeNavigation({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  })

  // Desktop arrow-key navigation (skip when a modal is open or user is typing)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && isFit) { setIsFit(false); return }
      if (performanceSections || editingSongId) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, performanceSections, editingSongId, isFit])

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

      {isCreatingNewAlbum
        ? <NewAlbumCreator album={editingAlbum} />
        : activeAlbum
        ? <AlbumDetailView album={activeAlbum} />
        : isCreatingNewCollection
        ? <NewCollectionCreator onOpenSidebar={onOpenSidebar} />
        : selectedCollectionId
        ? <CollectionDetailView onAddToast={onAddToast} onOpenSidebar={onOpenSidebar} />
        : isCreatingNewSong
        ? <NewSongEditor />
        : editingSongId
        ? <SongEditor songId={editingSongId} />
        : !activeSong
          ? <EmptyState onFileChange={handleFileInput} />
          : !isFit
          ? <div
              key={activeSongId}
              className={`h-full overflow-x-hidden
                ${swipeDir === 'left'  ? 'animate-slideFromRight' : ''}
                ${swipeDir === 'right' ? 'animate-slideFromLeft'  : ''}
              `}
              onAnimationEnd={() => setSwipeDir(null)}
            >
              <SongView
                song={activeSong}
                onPerformanceMode={setPerformanceSections}
                lyricsOnly={lyricsOnly}
                fontSize={fontSize}
                onFontSizeChange={onFontSizeChange}
                chordsOpen={chordsOpen}
                onChordsToggle={() => setChordsOpen(o => !o)}
                onEdit={() => setEditingSongId(activeSongId)}
                isFit={false}
                containerRef={containerRef}
              />
            </div>
          : null
      }

      {/* Full-viewport maximize overlay */}
      {isFit && activeSong && (
        <div
          className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            onClick={() => setIsFit(false)}
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Exit maximize"
          >
            <ArrowsPointingInIcon className="w-5 h-5" />
          </button>
          <div
            key={activeSongId}
            className={`h-full overflow-x-hidden
              ${swipeDir === 'left'  ? 'animate-slideFromRight' : ''}
              ${swipeDir === 'right' ? 'animate-slideFromLeft'  : ''}
            `}
            onAnimationEnd={() => setSwipeDir(null)}
          >
            <SongView
              song={activeSong}
              onPerformanceMode={setPerformanceSections}
              lyricsOnly={lyricsOnly}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              chordsOpen={chordsOpen}
              onChordsToggle={() => setChordsOpen(o => !o)}
              onEdit={() => setEditingSongId(activeSongId)}
              isFit={true}
              containerRef={containerRef}
            />
          </div>
        </div>
      )}

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

      {/* Collection swipe indicator (mobile only) — fades after 5s, dismissed on first swipe */}
      {inCollection && swipeHintVisible && (prevEntry || nextEntry) && (
        <div
          className="pointer-events-none md:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 animate-swipe-fade-out"
          onAnimationEnd={() => setSwipeHintVisible(false)}
        >
          <img
            src={swipeIcon}
            alt="Swipe to navigate"
            className="w-12 h-12 object-contain animate-swipe-gesture [mix-blend-mode:multiply] dark:invert dark:[mix-blend-mode:screen]"
          />
        </div>
      )}
      {inCollection && navOrder.length > 1 && (
        <div className="pointer-events-none md:hidden fixed bottom-4 left-4 z-20
          text-xs text-gray-400 dark:text-gray-500 font-mono tabular-nums select-none">
          {currentIdx + 1} / {navOrder.length}
        </div>
      )}

      {/* Floating controls — grouped pill card */}
      {activeSong && !isFit && !isCreatingNewAlbum && !activeAlbum && !isCreatingNewCollection && !selectedCollectionId && (
        <div
          ref={pillRef}
          className="fixed right-4 z-20 pointer-events-auto"
          style={{
            bottom: pillTop === null ? '1rem' : undefined,
            top: pillTop !== null ? `${pillTop}px` : undefined,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div className="flex flex-col items-center gap-0.5 bg-white/25 dark:bg-gray-900/25 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/40 dark:border-gray-700/30 py-2 px-1.5">
            {/* Drag handle */}
            <div
              onPointerDown={startPillDrag}
              className="w-full flex justify-center pt-0.5 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
              aria-label="Drag to reposition toolbar"
            >
              <div className="flex flex-col gap-[3px]">
                <div className="w-4 h-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50" />
                <div className="w-4 h-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50" />
              </div>
            </div>
            {speedMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setTargetDuration(targetDuration + 5)}
                  disabled={targetDuration >= 600}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 text-2xl font-light select-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Slower (increase scroll duration)"
                >+</button>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums select-none py-0.5">
                  {formatDuration(targetDuration)}
                </span>
                <button
                  type="button"
                  onClick={() => setTargetDuration(targetDuration - 5)}
                  disabled={targetDuration <= 30}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 text-2xl font-light select-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Faster (decrease scroll duration)"
                >−</button>
                <div className="w-6 h-px bg-gray-200 dark:bg-gray-700 my-0.5" />
                <button
                  type="button"
                  onClick={() => setSpeedMode(false)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
                  aria-label="Done adjusting speed"
                >Done</button>
              </>
            ) : bpmMode ? (
              <>
                <button
                  type="button"
                  onClick={() => onMetronomeBpmChange(Math.min(300, metronomeBpm + 5))}
                  disabled={metronomeBpm >= 300}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 text-2xl font-light select-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Increase BPM"
                >+</button>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums select-none py-0.5">
                  {metronomeBpm}
                </span>
                <button
                  type="button"
                  onClick={() => onMetronomeBpmChange(Math.max(30, metronomeBpm - 5))}
                  disabled={metronomeBpm <= 30}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 text-2xl font-light select-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Decrease BPM"
                >−</button>
                <div className="w-6 h-px bg-gray-200 dark:bg-gray-700 my-0.5" />
                <button
                  type="button"
                  onClick={() => setBpmMode(false)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
                  aria-label="Done adjusting BPM"
                >Done</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsFit(f => !f)}
                  className={`w-11 h-11 flex items-center justify-center rounded-xl select-none transition-colors
                    ${isFit
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  aria-label="Fit song to screen"
                >
                  {isFit ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
                </button>
                <div className="w-6 h-px bg-gray-200 dark:bg-gray-700 my-0.5" />
                <button
                  type="button"
                  onClick={() => onFontSizeChange(Math.min(fontSize + 2, 28))}
                  disabled={fontSize >= 28 || isFit}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 text-lg font-light select-none hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Increase font size"
                >+</button>
                <button
                  type="button"
                  onClick={() => onFontSizeChange(Math.max(fontSize - 2, 12))}
                  disabled={fontSize <= 12 || isFit}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 text-lg font-light select-none hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Decrease font size"
                >−</button>
                <div className="w-6 h-px bg-gray-200 dark:bg-gray-700 my-0.5" />
                {isScrolling && (
                  <button
                    type="button"
                    onClick={() => setSpeedMode(true)}
                    className="w-11 h-7 flex items-center justify-center rounded-lg text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums select-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Adjust scroll speed"
                  >{formatDuration(targetDuration)}</button>
                )}
                <button
                  type="button"
                  onClick={isScrolling ? stop : () => { start(); setSpeedMode(true) }}
                  className={`w-11 h-11 flex items-center justify-center rounded-xl select-none transition-colors
                    ${isScrolling
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  aria-label={isScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'}
                >
                  {isScrolling ? <StopIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                </button>
                {metronomeEnabled && (
                  <button
                    type="button"
                    onClick={() => setBpmMode(true)}
                    className="w-11 h-7 flex items-center justify-center rounded-lg text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums select-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Adjust metronome BPM"
                  >{metronomeBpm}</button>
                )}
                <button
                  type="button"
                  onClick={metronomeEnabled ? onMetronomeToggle : () => { onMetronomeToggle(); setBpmMode(true) }}
                  className={`w-11 h-11 flex items-center justify-center rounded-xl select-none transition-colors
                    ${metronomeEnabled
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  aria-label={metronomeEnabled ? 'Disable metronome flash' : 'Enable metronome flash'}
                ><img src={metronomeIcon} alt="" className="w-6 h-6 object-contain" /></button>
              </>
            )}
          </div>
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
