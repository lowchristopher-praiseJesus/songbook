import { useRef, useState, useCallback, useEffect } from 'react'
import { ArrowsPointingOutIcon, ArrowsPointingInIcon, PlayIcon, StopIcon, PencilIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon } from '@heroicons/react/24/outline'
import { useLibraryStore } from '../../store/libraryStore'
import { useAnnotationStore } from '../../store/annotationStore'
import { useYoutubePlayerStore } from '../../store/youtubePlayerStore'
import { YoutubeSearchModal } from '../YoutubeSearch/YoutubeSearchModal'
import { AnnotationToolbar } from '../Annotation/AnnotationToolbar'
import { useDropZone } from '../../hooks/useDropZone'
import { useFileImport } from '../../hooks/useFileImport'
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation'
import { useFitToScreen } from '../../hooks/useFitToScreen'
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
import { useWakeLock } from '../../hooks/useWakeLock'
import { useScrollActivity } from '../../hooks/useScrollActivity'
import { formatDuration } from '../../lib/formatDuration'
import metronomeIcon from '../../assets/metronome.png'
import swipeIcon from '../../assets/swipe.png'
import { AlbumDetailView } from '../Album/AlbumDetailView'
import { NewAlbumCreator } from '../Album/NewAlbumCreator'
import { CollectionDetailView } from '../Collection/CollectionDetailView'
import { NewCollectionCreator } from '../Collection/NewCollectionCreator'

export function MainContent({ onAddToast, lyricsOnly = false, hideChordDiagram = false, fontSize = 16, onFontSizeChange, onImportSuccess, onOpenSidebar, metronomeEnabled, onMetronomeToggle, metronomeBpm = 120, onMetronomeBpmChange, maximizeMinFontSize = 18 }) {
  const activeSong = useLibraryStore(s => s.activeSong)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const selectSong = useLibraryStore(s => s.selectSong)
  const setViewMode = useLibraryStore(s => s.setViewMode)
  const setExpandedCollectionId = useLibraryStore(s => s.setExpandedCollectionId)
  const setSongYoutubeVideo = useLibraryStore(s => s.setSongYoutubeVideo)
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
  const setSelectedCollectionId = useLibraryStore(s => s.setSelectedCollectionId)
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
  const [currentPage, setCurrentPage] = useState(0)
  // Holds the song id we're mid-cross into when paging backward past the
  // first page of a song (so we should land on its *last* page instead of
  // its first) — null otherwise. Keyed to song identity rather than a plain
  // boolean so it survives useFitToScreen's own re-measurement of the same
  // song (e.g. its self-correcting double-rAF pass): as long as the ref
  // still points at the currently active song, the reset effect below keeps
  // recomputing the last page against whatever totalPages currently is,
  // instead of one-shot-clearing the intent on the first re-fire.
  const landOnLastPageRef = useRef(null)
  const [speedMode, setSpeedMode] = useState(false)
  const [bpmMode, setBpmMode] = useState(false)
  const containerRef = useRef(null)
  const bodyRef = useRef(null)
  const annotationBaseline = useAnnotationStore(s => s.baseline)
  const annotateMode = useAnnotationStore(s => s.annotateMode)
  const userZoom = useAnnotationStore(s => s.userZoom)
  const setAnnotateMode = useAnnotationStore(s => s.setAnnotateMode)
  const setUserZoom = useAnnotationStore(s => s.setUserZoom)
  const resetAnnotationZoom = useAnnotationStore(s => s.resetZoom)
  const loadAnnotationsForSong = useAnnotationStore(s => s.loadForSong)
  // Rendered once, here, rather than inside SongHeader: SongHeader's subtree
  // gets unmounted when entering Maximize mode (isFit) or is simply covered
  // by an overlay in Performance mode, so a player owned by it would stop
  // playing the moment either mode was entered. Keeping it at this level —
  // which is never unmounted while activeSong stays the same — lets the
  // video keep playing across both.
  const ytOpenForSongId = useYoutubePlayerStore(s => s.openForSongId)
  const ytMinimized = useYoutubePlayerStore(s => s.minimized)
  const ytMinimize = useYoutubePlayerStore(s => s.minimize)
  const ytExpand = useYoutubePlayerStore(s => s.expand)
  const ytClose = useYoutubePlayerStore(s => s.close)
  const ytOpen = ytOpenForSongId === activeSongId

  useEffect(() => {
    ytClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSongId])

  // Expose the minimized bar's height as a CSS variable on the root so the
  // lyrics scroll area (in SongList) can reserve bottom padding and keep the
  // last lines visible above the fixed bottom bar.
  useEffect(() => {
    const barVisible = ytOpen && ytMinimized
    document.documentElement.style.setProperty('--yt-min-bar-h', barVisible ? '3.5rem' : '0px')
    return () => {
      document.documentElement.style.setProperty('--yt-min-bar-h', '0px')
    }
  }, [ytOpen, ytMinimized])
  const {
    fitFontSize,
    fitColumns,
    paginated,
    totalColumns,
    totalPages,
    pageColWidth,
    fitAvailableHeight,
    shadowRef,
    canIncrease,
    canDecrease,
    increaseFontSize,
    decreaseFontSize,
    settled,
    measuredSongId,
  } = useFitToScreen({ enabled: isFit && !annotationBaseline, containerRef, bodyRef, lyricsOnly, songId: activeSongId, minFontSize: maximizeMinFontSize })

  // Once an annotation baseline is captured, useFitToScreen is disabled (see
  // above) and its own pagination state collapses to the "off" defaults
  // (totalPages: 1, paginated: false) — it's no longer measuring anything.
  // Pagination for a frozen/annotated song instead comes from the snapshot
  // captureBaseline took of the live fit result at the moment of the first
  // stroke, so in-song page navigation keeps working after annotating.
  const effectivePaginated = annotationBaseline ? !!annotationBaseline.paginated : paginated
  const effectiveTotalPages = annotationBaseline ? (annotationBaseline.totalPages ?? 1) : totalPages

  // Keep the annotation layer's stroke/baseline data in sync with whichever
  // song is active, regardless of whether Maximize mode is currently open.
  useEffect(() => {
    if (activeSongId) loadAnnotationsForSong(activeSongId)
  }, [activeSongId, loadAnnotationsForSong])
  const { targetDuration, setTargetDuration } = useScrollSettings(activeSongId)
  const { isScrolling, start, stop } = useAutoScroll(containerRef, targetDuration)

  // Keep the screen awake on stage: while Performance mode is open or
  // auto-scroll is running, the device must not dim/sleep mid-song.
  useWakeLock(!!performanceSections || isScrolling)

  // Dim the floating tool rail while the user is reading/scrolling so it
  // doesn't occlude full-width lyric lines on phones; it stays tappable.
  const mainRef = useRef(null)
  const scrollActive = useScrollActivity(mainRef)

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
  const backCollection = activeCollectionId
    ? collections.find(c => c.id === activeCollectionId) ?? null
    : null

  // Reset (or, when arriving via a backward page-cross, jump to the last page
  // of) the current page whenever the song, lyrics-only mode, or the fit
  // result changes. Gated on useFitToScreen's own `settled` flag rather than
  // guessing its internal rAF timing: the hook reports `settled: false` for
  // its transitional first-pass measurement and `settled: true` once its
  // double-rAF self-correction has actually landed, so this effect ignores
  // the unsettled re-fire entirely and only acts once the hook says the
  // result is final — at which point it's safe to tell a same-song
  // self-correction (still armed → land on the corrected last page) apart
  // from a genuine later user action, like a manual font-size change (ref no
  // longer armed for this song → normal reset to page 0).
  //
  // `settled` alone isn't sufficient, though: useFitToScreen's internal
  // state is a separate useState that can't synchronously track a songId
  // prop change — it only catches up once the hook's own effect runs, one
  // commit later. So right after a song switch, this effect can fire with
  // activeSongId already pointing at the NEW song but totalPages/settled
  // still holding the PREVIOUS (already-settled) song's values. Requiring
  // measuredSongId === activeSongId confirms the hook's own state is
  // actually reporting on the song we currently care about before we trust
  // totalPages/settled at all.
  useEffect(() => {
    // When the active song has a captured annotation baseline,
    // useFitToScreen is disabled (see above) and its `settled`/measuredSongId
    // never fire for this song — they'd otherwise gate this effect forever,
    // leaving currentPage stuck at whatever the previously active song left
    // it on (e.g. "Page 4 of 2" after swiping from a 4-page song into a
    // 2-page one). Reset/land using the baseline's own totalPages instead.
    if (annotationBaseline) {
      if (landOnLastPageRef.current === activeSongId) {
        setCurrentPage(Math.max(0, (annotationBaseline.totalPages ?? 1) - 1))
        landOnLastPageRef.current = null
      } else {
        setCurrentPage(0)
      }
      return
    }
    if (!settled || measuredSongId !== activeSongId) return
    if (landOnLastPageRef.current === activeSongId) {
      setCurrentPage(Math.max(0, totalPages - 1))
      landOnLastPageRef.current = null
    } else {
      setCurrentPage(0)
    }
  }, [activeSongId, lyricsOnly, totalPages, fitFontSize, settled, measuredSongId, annotationBaseline])

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
    if (isFit && effectiveTotalPages > 1 && currentPage < effectiveTotalPages - 1) {
      setCurrentPage(p => p + 1)
      return
    }
    if (!nextEntry) return
    landOnLastPageRef.current = null
    setSwipeDir('left')
    selectSong(nextEntry.id)
    showHint(nextEntry.title, 'left')
    dismissSwipeHint()
  }, [isFit, effectiveTotalPages, currentPage, nextEntry, selectSong])

  const goPrev = useCallback(() => {
    if (isFit && effectiveTotalPages > 1 && currentPage > 0) {
      setCurrentPage(p => p - 1)
      return
    }
    if (!prevEntry) return
    landOnLastPageRef.current = prevEntry.id
    setSwipeDir('right')
    selectSong(prevEntry.id)
    showHint(prevEntry.title, 'right')
    dismissSwipeHint()
  }, [isFit, effectiveTotalPages, currentPage, prevEntry, selectSong])

  const { onTouchStart, onTouchEnd } = useSwipeNavigation({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  })

  // Desktop arrow-key navigation (skip when a modal is open or user is typing)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && isFit && annotateMode) { setAnnotateMode(false); return }
      if (e.key === 'Escape' && isFit) { setIsFit(false); return }
      if (performanceSections || editingSongId || annotateMode) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, performanceSections, editingSongId, isFit, annotateMode, setAnnotateMode])

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
    // Mirror the Sidebar import path: land the user on what they just
    // imported instead of leaving the "No songs yet" empty state up.
    onSuccess: ({ newSongIds, collectionId } = {}) => {
      if (newSongIds?.length > 0) {
        if (collectionId) {
          setViewMode('collections')
          setExpandedCollectionId(collectionId)
        } else {
          setViewMode('allSongs')
        }
        selectSong(newSongIds[0])
      }
      onImportSuccess?.()
    },
  })

  const { isDragging, onDragOver, onDragLeave, onDrop } = useDropZone(importFiles)

  const handleClosePerformance = useCallback(() => setPerformanceSections(null), [])

  function exitMaximize() {
    setIsFit(false)
    setAnnotateMode(false)
  }

  function handleFileInput(e) {
    importFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  return (
    <main
      ref={mainRef}
      className={`flex-1 overflow-y-auto relative transition-colors
        ${isDragging ? 'ring-4 ring-indigo-400 ring-inset bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onTouchStart={annotateMode ? undefined : onTouchStart}
      onTouchEnd={annotateMode ? undefined : onTouchEnd}
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
        ? <NewSongEditor onAddToast={onAddToast} />
        : editingSongId
        ? <SongEditor songId={editingSongId} onAddToast={onAddToast} />
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
                hideChordDiagram={hideChordDiagram}
                fontSize={fontSize}
                onFontSizeChange={onFontSizeChange}
                chordsOpen={chordsOpen}
                onChordsToggle={() => setChordsOpen(o => !o)}
                onEdit={() => setEditingSongId(activeSongId)}
                isFit={false}
                containerRef={containerRef}
                collectionName={backCollection?.name ?? null}
                onBackToCollection={() => setSelectedCollectionId(activeCollectionId)}
              />
            </div>
          : null
      }

      {/* Full-viewport maximize overlay */}
      {isFit && activeSong && (
        <div
          data-testid="maximize-overlay"
          className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col overflow-hidden"
          onTouchStart={annotateMode ? undefined : onTouchStart}
          onTouchEnd={annotateMode ? undefined : onTouchEnd}
        >
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5">
              {annotationBaseline ? (
                <>
                  <button
                    type="button"
                    onClick={() => setUserZoom(userZoom + 0.25)}
                    disabled={userZoom >= 4}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    aria-label="Zoom in"
                  ><MagnifyingGlassPlusIcon className="w-5 h-5" /></button>
                  <button
                    type="button"
                    onClick={() => (userZoom > 1 ? setUserZoom(userZoom - 0.25) : resetAnnotationZoom())}
                    disabled={userZoom <= 1}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    aria-label="Zoom out"
                  ><MagnifyingGlassMinusIcon className="w-5 h-5" /></button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={increaseFontSize}
                    disabled={!canIncrease}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 text-lg font-light select-none hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    aria-label="Increase font size"
                  >+</button>
                  <button
                    type="button"
                    onClick={decreaseFontSize}
                    disabled={!canDecrease}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 text-lg font-light select-none hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    aria-label="Decrease font size"
                  >−</button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAnnotateMode(!annotateMode)}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors
                ${annotateMode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              aria-label={annotateMode ? 'Stop annotating' : 'Annotate'}
              aria-pressed={annotateMode}
            >
              <PencilIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={exitMaximize}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Exit maximize"
            >
              <ArrowsPointingInIcon className="w-5 h-5" />
            </button>
          </div>
          {annotateMode && <AnnotationToolbar />}
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
              hideChordDiagram={hideChordDiagram}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              chordsOpen={chordsOpen}
              onChordsToggle={() => setChordsOpen(o => !o)}
              onEdit={() => setEditingSongId(activeSongId)}
              isFit={true}
              containerRef={containerRef}
              bodyRef={bodyRef}
              fitFontSize={fitFontSize}
              fitColumns={fitColumns}
              paginated={paginated}
              totalColumns={totalColumns}
              currentPage={currentPage}
              pageColWidth={pageColWidth}
              fitAvailableHeight={fitAvailableHeight}
              shadowRef={shadowRef}
            />
          </div>

          {effectivePaginated && effectiveTotalPages > 1 && (
            <div
              data-testid="page-indicator"
              className="pointer-events-none fixed bottom-20 left-1/2 -translate-x-1/2
                px-3 py-1 rounded-full bg-gray-900/70 dark:bg-gray-100/70
                text-white dark:text-gray-900 text-xs font-medium
                z-30 whitespace-nowrap select-none"
            >
              Page {currentPage + 1} of {effectiveTotalPages}
            </div>
          )}
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
          className={`fixed right-4 z-20 pointer-events-auto transition-opacity duration-300
            ${scrollActive ? 'opacity-30' : 'opacity-100'}`}
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
        <PerformanceModal song={activeSong} sections={performanceSections} navOrder={navOrder} lyricsOnly={lyricsOnly} hideChordDiagram={hideChordDiagram} onClose={handleClosePerformance} />
      )}

      {activeSong && (
        <YoutubeSearchModal
          isOpen={ytOpen}
          minimized={ytMinimized}
          onMinimize={ytMinimize}
          onExpand={ytExpand}
          onClose={ytClose}
          title={activeSong.meta.title}
          artist={activeSong.meta.artist}
          initialVideoId={activeSong.meta.youtubeVideoId}
          initialStartSeconds={activeSong.meta.youtubeStartSeconds}
          onVideoPicked={(videoId, startSeconds) => setSongYoutubeVideo(activeSongId, videoId, startSeconds)}
        />
      )}
    </main>
  )
}
