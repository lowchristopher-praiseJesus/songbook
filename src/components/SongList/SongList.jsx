import { useRef, useEffect, useState } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { useFitToScreen } from '../../hooks/useFitToScreen'
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
}) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id, song.meta.capo ?? 0)

  useEffect(() => {
    document.documentElement.style.setProperty('--lyrics-size', `${fontSize}px`)
  }, [fontSize])
  const bodyRef = useRef(null)
  const [annotationsVisible, setAnnotationsVisible] = useLocalStorage('songsheet_annotations_visible', true)
  const [panelOpen, setPanelOpen] = useState(false)
  const { fitFontSize, fitColumns, shadowRef } = useFitToScreen({
    enabled: isFit,
    containerRef,
    bodyRef,
    lyricsOnly,
  })

  const recording = useRecording({
    songId: song.id ?? '',
    songTitle: song.meta.title ?? '',
  })

  const isActiveRecording = recording.status === 'recording' || recording.status === 'paused'

  return (
    <>
      {/* Sticky recording bar — pinned to top of scroll container when recording is active */}
      {!isFit && RECORDER_SUPPORTED && isActiveRecording && (
        <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-red-200 dark:border-red-800 shadow-sm">
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

      <div
        className={`w-full relative px-4 py-6 ${isFit ? '' : 'max-w-2xl mx-auto'}`}
        style={isFit && fitFontSize ? { '--fit-fs': `${fitFontSize}px` } : undefined}
      >
        <div ref={headerRef}>
          {!isFit && (
            <>
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
              />
              {!lyricsOnly && !hideChordDiagram && (
                <ChordStrip
                  sections={transpose.transposedSections}
                  open={chordsOpen}
                  onToggle={onChordsToggle}
                />
              )}
            </>
          )}
        </div>
        <div ref={bodyRef}>
          <SongBody
            sections={transpose.transposedSections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            fitMode={isFit && fitFontSize !== null}
            fitColumns={fitColumns}
            annotationsVisible={annotationsVisible}
            sectionRefs={sectionRefs}
          />
        </div>
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
