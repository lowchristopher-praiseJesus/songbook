import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { SongHeader } from '../SongHeader'

vi.mock('../../../hooks/useRecording', () => ({
  useRecording: vi.fn(() => ({
    status: 'idle',
    elapsedMs: 0,
    pendingName: '',
    error: null,
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    saveRecording: vi.fn(),
    cancelNaming: vi.fn(),
  })),
}))

vi.mock('../../../lib/recorderFeatureDetect', () => ({
  checkRecorderSupport: vi.fn(() => ({ supported: false })),
}))

vi.mock('../../Recorder/RecordingsPanel', () => ({
  RecordingsPanel: vi.fn(() => null),
}))

const meta = { title: 'Test Song', keyIndex: 0 }
const transpose = {
  delta: 0,
  capo: 0,
  capoUp: vi.fn(),
  capoDown: vi.fn(),
  transposeTo: vi.fn(),
  transposedSections: [],
  usesFlats: false,
}

describe('SongHeader headerRef', () => {
  it('attaches headerRef to the root div', () => {
    const headerRef = createRef()
    render(
      <SongHeader
        meta={meta}
        transpose={transpose}
        lyricsOnly={false}
        onPerformanceMode={vi.fn()}
        onExportPdf={vi.fn()}
        onEdit={vi.fn()}
        headerRef={headerRef}
      />
    )
    expect(headerRef.current).not.toBeNull()
    expect(headerRef.current.tagName).toBe('DIV')
  })
})
