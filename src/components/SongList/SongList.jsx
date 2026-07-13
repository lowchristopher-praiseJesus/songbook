import { useEffect, useState } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { useLibraryStore } from '../../store/libraryStore'
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
  bodyRef,
  fitFontSize,
  fitColumns,
  shadowRef,
}) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id, song.meta.capo ?? 0)
  const setSongYoutubeVideo = useLibraryStore(s => s.setSongYoutubeVideo)

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

  return (
    <>
      {/* Sticky top region — on desktop (md+), the active recording bar and the song
          header (title + controls + chord strip) stay pinned while the song body
          scrolls beneath. On mobile the header takes up too much of the viewport, so
          it scrolls away with the rest of the content instead. */}
      {!isFit && (
        <div className="md:sticky md:top-0 md:z-10">
          {RECORDER_SUPPORTED && isActiveRecording && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-red-200 dark:border-red-800 shadow-sm">
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
                  onYoutubeVideoPicked={videoId => setSongYoutubeVideo(song.id, videoId)}
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
        style={isFit && fitFontSize ? { '--fit-fs': `${fitFontSize}px` } : undefined}
      >
        {isFit && (
          <div className="mb-4">
            <h1
              className="font-bold leading-tight"
              style={{ fontFamily: 'var(--title-font)', fontSize: 'var(--title-size)', color: 'var(--title-color-active)' }}
            >{song.meta.title}</h1>
            {(song.meta.key || song.meta.tempo) && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {song.meta.key && <span>Key: {song.meta.key}</span>}
                {song.meta.key && song.meta.tempo && <span className="mx-1.5">·</span>}
                {song.meta.tempo && <span>BPM: {song.meta.tempo}</span>}
              </p>
            )}
          </div>
        )}
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
