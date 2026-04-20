import { useState } from 'react'
import { TransposeControl } from './TransposeControl'
import { RecorderButton } from '../Recorder/RecorderButton'
import { RecordingTimer } from '../Recorder/RecordingTimer'
import { NamingDialog } from '../Recorder/NamingDialog'
import { RecordingsPanel } from '../Recorder/RecordingsPanel'
import { useRecording } from '../../hooks/useRecording'
import { checkRecorderSupport } from '../../lib/recorderFeatureDetect'

const { supported: RECORDER_SUPPORTED } = checkRecorderSupport()

export function SongHeader({
  meta,
  transpose,
  lyricsOnly,
  onPerformanceMode,
  onExportPdf,
  onEdit,
  headerRef,
  annotationsVisible = true,
  onAnnotationsToggle,
  songId,
}) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const hasInfo = meta.tempo || meta.timeSignature || meta.capo > 0 || meta.ccli || meta.copyright

  const recording = useRecording({
    songId: songId ?? '',
    songTitle: meta.title ?? '',
  })

  return (
    <div ref={headerRef} className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-2">
      <h1 className="text-2xl font-bold leading-tight">{meta.title}</h1>
      {meta.artist && (
        <p className="text-gray-500 dark:text-gray-400 mt-0.5">{meta.artist}</p>
      )}
      {annotationsVisible && meta.annotation && (
        <p className="text-sm italic text-gray-400 dark:text-gray-500 mt-0.5">{meta.annotation}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {!lyricsOnly && (
          <>
            <TransposeControl
              delta={transpose.delta}
              onTransposeTo={transpose.transposeTo}
              originalKeyIndex={meta.keyIndex}
              isMinor={meta.isMinor}
            />
            <div className="flex items-center gap-1" aria-label="Capo controls">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Capo</span>
              <button
                type="button"
                onClick={transpose.capoDown}
                disabled={transpose.capo === 0}
                className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Decrease capo"
              >−</button>
              <span className="w-4 text-center text-sm font-mono">{transpose.capo}</span>
              <button
                type="button"
                onClick={transpose.capoUp}
                disabled={transpose.capo === 7}
                className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Increase capo"
              >+</button>
            </div>
          </>
        )}

        {hasInfo && (
          <button
            type="button"
            onClick={() => setInfoOpen(o => !o)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
            aria-expanded={infoOpen}
          >
            Info {infoOpen ? '▲' : '▼'}
          </button>
        )}

        {lyricsOnly && (
          <button
            type="button"
            onClick={onExportPdf}
            className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            ↓ PDF
          </button>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Edit
        </button>

        {onAnnotationsToggle && (
          <button
            type="button"
            onClick={onAnnotationsToggle}
            className={`text-sm px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-gray-400 ${
              annotationsVisible
                ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            }`}
            aria-label={annotationsVisible ? 'Hide annotations' : 'Show annotations'}
            title={annotationsVisible ? 'Hide annotations' : 'Show annotations'}
          >
            💬
          </button>
        )}

        {songId && RECORDER_SUPPORTED && (
          <>
            <RecordingTimer elapsedMs={recording.elapsedMs} status={recording.status} />
            <RecorderButton
              status={recording.status}
              onStart={recording.startRecording}
              onStop={recording.stopRecording}
              onPause={recording.pauseRecording}
              onResume={recording.resumeRecording}
            />
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              aria-label="Recordings"
              title="View recordings"
              className="text-sm px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              🎵 Recordings
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onPerformanceMode}
          className="ml-auto text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          ⛶ Performance
        </button>
      </div>

      {infoOpen && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          {meta.key && <div><span className="font-medium text-gray-700 dark:text-gray-300">Key:</span> {meta.key}</div>}
          {meta.capo > 0 && <div><span className="font-medium text-gray-700 dark:text-gray-300">Capo:</span> {meta.capo}</div>}
          {meta.tempo && <div><span className="font-medium text-gray-700 dark:text-gray-300">BPM:</span> {meta.tempo}</div>}
          {meta.timeSignature && <div><span className="font-medium text-gray-700 dark:text-gray-300">Time:</span> {meta.timeSignature}</div>}
          {meta.ccli && <div><span className="font-medium text-gray-700 dark:text-gray-300">CCLI:</span> {meta.ccli}</div>}
          {meta.copyright && <div className="col-span-2 text-xs"><span className="font-medium text-gray-700 dark:text-gray-300">©</span> {meta.copyright}</div>}
        </div>
      )}

      <NamingDialog
        isOpen={recording.status === 'naming'}
        defaultName={recording.pendingName}
        onSave={recording.saveRecording}
        onCancel={recording.cancelNaming}
      />

      <RecordingsPanel
        isOpen={panelOpen}
        songId={songId}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  )
}
