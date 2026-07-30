import { useEffect, useRef, useState } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { useAnnotationStore } from '../../store/annotationStore'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'
import { exportLyricsPdf } from '../../lib/exportPdf'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { useRecording } from '../../hooks/useRecording'
import { checkRecorderSupport } from '../../lib/recorderFeatureDetect'
import { RecordingTimer } from '../Recorder/RecordingTimer'
import { RecorderButton } from '../Recorder/RecorderButton'
import { NamingDialog } from '../Recorder/NamingDialog'
import { RecordingErrorDialog } from '../Recorder/RecordingErrorDialog'
import { RecordingsPanel } from '../Recorder/RecordingsPanel'
import { AnnotatedMaximizeView } from '../Annotation/AnnotatedMaximizeView'
import { SongTitleBlock } from './SongTitleBlock'

const { supported: RECORDER_SUPPORTED } = checkRecorderSupport()

export function SongList({
  song,
  onPerformanceMode,
  lyricsOnly = false,
  hideChordDiagram = false,
  fontSize = 16,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit = false,
  containerRef,
  sectionRefs,
  headerRef,
  bodyRef,
  fitFontSize,
  fitColumns,
  paginated,
  totalColumns,
  currentPage,
  pageColWidth,
  fitAvailableHeight,
  shadowRef,
  collectionName = null,
  onBackToCollection,
}) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id, song.meta.capo ?? 0)
  const baseline = useAnnotationStore(s => s.baseline)
  const effectivePaginated = baseline ? !!baseline.paginated : paginated

  useEffect(() => {
    document.documentElement.style.setProperty('--lyrics-size', `${fontSize}px`)
  }, [fontSize])
  const [annotationsVisible, setAnnotationsVisible] = useLocalStorage('songsheet_annotations_visible', true)
  const [panelOpen, setPanelOpen] = useState(false)

  const recording = useRecording({
    songId: song.id ?? '',
    songTitle: song.meta.title ?? '',
  })

  const isActiveRecording = recording.status === 'recording' || recording.status === 'paused'

  // Height of the pinned active-recording bar. The bar is sticky on every
  // viewport (its whole purpose is to stay visible while lyrics scroll), while
  // the song header below is only sticky on desktop. On desktop we offset the
  // header's sticky `top` by this height so the two stack instead of overlap.
  const recBarRef = useRef(null)
  const [recBarH, setRecBarH] = useState(0)
  useEffect(() => {
    if (!isActiveRecording) {
      setRecBarH(0)
      return
    }
    const el = recBarRef.current
    if (!el) return
    const measure = () => setRecBarH(el.getBoundingClientRect().height)
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [isActiveRecording])

  return (
    <>
      {/* Active-recording bar — pinned at the top on every viewport so it stays
          visible while the song scrolls. (The song header below is only pinned on
          desktop, since on mobile it would eat too much viewport.) On desktop the
          header sticks just beneath this bar via the measured `top` offset. */}
      {!isFit && RECORDER_SUPPORTED && isActiveRecording && (
        <div
          ref={recBarRef}
          className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-red-200 dark:border-red-800 shadow-sm"
        >
          {recording.status === 'recording' && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true" />
          )}
          <RecordingTimer elapsedMs={recording.elapsedMs} status={recording.status} />
          {recording.channels != null && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
              {recording.channels >= 2 ? 'Stereo' : 'Mono'}
            </span>
          )}
          <RecorderButton
            status={recording.status}
            onStart={recording.startRecording}
            onStop={recording.stopRecording}
            onPause={recording.pauseRecording}
            onResume={recording.resumeRecording}
          />
        </div>
      )}
      {/* Sticky song header (title + controls + chord strip) — desktop only.
          `top` is the height of the pinned recording bar above (0 when not
          recording), so the header stacks beneath it instead of overlapping.
          On mobile this is non-sticky, so `top` has no effect. */}
      {!isFit && (
        <div className="md:sticky md:z-10" style={{ top: `${recBarH}px` }}>
          {/* Full-width surface so scrolling lyrics don't show through beside the centered column */}
          <div className="bg-white dark:bg-gray-900">
            <div className="max-w-2xl mx-auto px-4 pt-6">
              <div ref={headerRef}>
                <SongHeader
                  meta={song.meta}
                  transpose={transpose}
                  lyricsOnly={lyricsOnly}
                  onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
                  onExportPdf={() => exportLyricsPdf(song.meta, song.sections, annotationsVisible)}
                  onEdit={onEdit}
                  annotationsVisible={annotationsVisible}
                  onAnnotationsToggle={() => setAnnotationsVisible(!annotationsVisible)}
                  songId={song.id}
                  recording={recording}
                  onPanelOpen={() => setPanelOpen(true)}
                  collectionName={collectionName}
                  onBackToCollection={onBackToCollection}
                />
                {!lyricsOnly && !hideChordDiagram && (
                  <ChordStrip
                    sections={transpose.transposedSections}
                    open={chordsOpen}
                    onToggle={onChordsToggle}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`w-full relative px-4 ${isFit ? 'py-6' : 'max-w-2xl mx-auto pb-6'}`}
        style={{
          ...(isFit && fitFontSize ? { '--fit-fs': `${fitFontSize}px` } : {}),
          // Reserve room above the minimized YouTube bar so the last lyric
          // lines stay scrollable into view. --yt-min-bar-h is 0px unless a
          // video is minimized (set by MainContent, which owns the player so
          // it survives this song-view subtree remounting); the pb-6 above
          // supplies the base 1.5rem this calc builds on.
          paddingBottom: 'calc(1.5rem + var(--yt-min-bar-h, 0px))',
        }}
      >
        {isFit && effectivePaginated && (
          <SongTitleBlock title={song.meta.title} songKey={song.meta.key} tempo={song.meta.tempo} />
        )}
        {isFit ? (
          <AnnotatedMaximizeView
            sections={transpose.transposedSections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            annotationsVisible={annotationsVisible}
            sectionRefs={sectionRefs}
            bodyRef={bodyRef}
            fitFontSize={fitFontSize}
            fitColumns={fitColumns}
            paginated={paginated}
            totalColumns={totalColumns}
            currentPage={currentPage}
            pageColWidth={pageColWidth}
            fitAvailableHeight={fitAvailableHeight}
            containerRef={containerRef}
            title={song.meta.title}
            songKey={song.meta.key}
            tempo={song.meta.tempo}
          />
        ) : (
          <div ref={bodyRef}>
            <SongBody
              sections={transpose.transposedSections}
              fontSize={fontSize}
              lyricsOnly={lyricsOnly}
              fitMode={false}
              annotationsVisible={annotationsVisible}
              sectionRefs={sectionRefs}
            />
          </div>
        )}
        {isFit && (
          <div
            ref={shadowRef}
            style={{
              position: 'absolute',
              top: '-9999px',
              left: '1rem',
              visibility: 'hidden',
              width: 'calc(100% - 2rem)',
              overflow: 'hidden',
            }}
          >
            <SongBody
              sections={transpose.transposedSections}
              fontSize={fontSize}
              lyricsOnly={lyricsOnly}
              fitMode
              annotationsVisible={annotationsVisible}
            />
          </div>
        )}
      </div>

      <NamingDialog
        isOpen={recording.status === 'naming'}
        defaultName={recording.pendingName}
        onSave={recording.saveRecording}
        onCancel={recording.cancelNaming}
      />
      <RecordingErrorDialog
        isOpen={recording.status === 'error' && !!recording.error}
        message={recording.error}
        onClose={recording.dismissError}
      />
      <RecordingsPanel
        isOpen={panelOpen}
        songId={song.id}
        onClose={() => setPanelOpen(false)}
        onRecordingsChange={recording.handleRecordingsChange}
      />
    </>
  )
}
