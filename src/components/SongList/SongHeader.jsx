import { useState } from 'react'
import {
  PencilIcon,
  ArrowsPointingOutIcon,
  ChatBubbleLeftEllipsisIcon,
  MusicalNoteIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { TransposeControl } from './TransposeControl'
import { RecorderButton } from '../Recorder/RecorderButton'
import { RecordingTimer } from '../Recorder/RecordingTimer'
import { NamingDialog } from '../Recorder/NamingDialog'
import { RecordingErrorDialog } from '../Recorder/RecordingErrorDialog'
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
    <div ref={headerRef} className="border-b border-gray-100 dark:border-gray-800 pb-4 mb-2">
      <h1
        className="font-bold leading-tight"
        style={{ fontFamily: 'var(--title-font)', fontSize: 'var(--title-size)', color: 'var(--title-color-active)' }}
      >{meta.title}</h1>
      {meta.artist && (
        <p className="mt-0.5" style={{ fontFamily: 'var(--artist-font)', fontSize: 'var(--artist-size)', color: 'var(--artist-color-active)' }}>{meta.artist}</p>
      )}
      {annotationsVisible && meta.annotation && (
        <p className="text-sm italic text-gray-400 dark:text-gray-500 mt-0.5">{meta.annotation}</p>
      )}

      {/* Row 1: Music controls (left) + Primary CTAs (right) */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-2 flex-wrap">
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
                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Decrease capo"
                >−</button>
                <span className="w-4 text-center text-sm font-mono">{transpose.capo}</span>
                <button
                  type="button"
                  onClick={transpose.capoUp}
                  disabled={transpose.capo === 7}
                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Increase capo"
                >+</button>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onPerformanceMode}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
            Performance
          </button>
        </div>
      </div>

      {/* Row 2: Secondary/utility controls */}
      {(hasInfo || lyricsOnly || onAnnotationsToggle || (songId && RECORDER_SUPPORTED)) && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {hasInfo && (
            <button
              type="button"
              onClick={() => setInfoOpen(o => !o)}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
              aria-expanded={infoOpen}
            >
              Info {infoOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
            </button>
          )}
          {lyricsOnly && (
            <button
              type="button"
              onClick={onExportPdf}
              className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
            >
              ↓ PDF
            </button>
          )}
          {onAnnotationsToggle && (
            <button
              type="button"
              onClick={onAnnotationsToggle}
              className={`flex items-center p-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer ${
                annotationsVisible
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
              }`}
              aria-label={annotationsVisible ? 'Hide annotations' : 'Show annotations'}
              title={annotationsVisible ? 'Hide annotations' : 'Show annotations'}
            >
              <ChatBubbleLeftEllipsisIcon className="w-4 h-4" />
            </button>
          )}
          {songId && RECORDER_SUPPORTED && (
            <>
              <RecordingTimer elapsedMs={recording.elapsedMs} status={recording.status} />
              {recording.channels != null && (recording.status === 'recording' || recording.status === 'paused') && (
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
              <div className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  aria-label={recording.hasRecordings ? 'Recordings available' : 'Recordings'}
                  title={recording.hasRecordings ? 'View recordings - this song has recordings' : 'View recordings'}
                  className="flex items-center gap-1.5 text-sm px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
                >
                  <MusicalNoteIcon className="w-3.5 h-3.5" /> Recordings
                </button>
                {recording.hasRecordings && (
                  <span
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"
                    aria-hidden="true"
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}

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

      <RecordingErrorDialog
        isOpen={recording.status === 'error' && !!recording.error}
        message={recording.error}
        onClose={recording.dismissError}
      />

      <RecordingsPanel
        isOpen={panelOpen}
        songId={songId}
        onClose={() => setPanelOpen(false)}
        onRecordingsChange={recording.handleRecordingsChange}
      />
    </div>
  )
}
