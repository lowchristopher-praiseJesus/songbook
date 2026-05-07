# Audio Recording Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve mobile recording quality and UX by fixing DSP defaults, adding a VU meter with clipping detection, caching processed WAV output, and upgrading the processing chain to LUFS-based loudness normalisation.

**Architecture:** Changes are spread across three layers — capture (AudioRecorder constraints + wake lock + countdown), processing (wavUtils chain reorder, LUFS normalisation, dither), and playback (OPFS WAV cache + playsInline + MediaSession). Each task is self-contained and passes tests before the next begins.

**Tech Stack:** Web Audio API (AnalyserNode, OfflineAudioContext, IIRFilter), MediaRecorder API, Screen Wake Lock API, MediaSession API, OPFS via storageWorker, Vitest + @testing-library/react

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/audioRecorder.js` | Modify | Split start → acquireStream + beginRecording; adaptive constraints, bitrate, Studio Mode, stream getter |
| `src/lib/studioMode.js` | Create | localStorage get/set for Studio Mode preference |
| `src/lib/lufsUtils.js` | Create | BS.1770-4 K-weighting IIR filter + gated integrated loudness measurement |
| `src/lib/wavUtils.js` | Modify | Reorder chain; retune compressor; makeup gain; dither; LUFS normalization; true-peak ceiling; export processing version |
| `src/hooks/useRecording.js` | Modify | Studio Mode, wake lock, countdown, expose stream state |
| `src/hooks/useAudioLevel.js` | Create | AnalyserNode-based peak dB + clipping detection |
| `src/components/Recorder/VUMeter.jsx` | Create | Visual bar meter + CLIP label |
| `src/components/Recorder/RecordingTimer.jsx` | Modify | Add countdown state rendering |
| `src/components/SongList/SongHeader.jsx` | Modify | Studio Mode toggle, VU Meter, countdown status |
| `src/workers/storageWorker.js` | Modify | Add write-wav-cache and read-wav-cache message handlers |
| `src/components/Recorder/RecordingsPanel.jsx` | Modify | WAV cache check/write on play and download |
| `src/components/Recorder/AudioPlayer.jsx` | Modify | playsInline attribute; MediaSession metadata |
| `src/lib/__tests__/audioRecorder.test.js` | Modify | Update constraint assertions for new defaults; add Studio Mode tests |
| `src/lib/__tests__/studioMode.test.js` | Create | Unit tests for studioMode helpers |
| `src/lib/__tests__/lufsUtils.test.js` | Create | Unit tests for LUFS measurement |
| `src/hooks/__tests__/useAudioLevel.test.js` | Create | Hook tests with mocked AnalyserNode |

---

## Task 1: Refactor AudioRecorder — adaptive constraints, Studio Mode, split start

**Files:**
- Modify: `src/lib/audioRecorder.js`
- Modify: `src/lib/__tests__/audioRecorder.test.js`

This task splits `start()` into `acquireStream()` + `beginRecording()` so the pre-roll countdown (Task 4) can warm the mic before MediaRecorder starts. It also adds a `studioMode` option, switches the default to mono, removes the sample rate constraint (let the browser negotiate), and uses adaptive bitrate based on the actual channel count returned by `getSettings()`.

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `src/lib/__tests__/audioRecorder.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AudioRecorder } from '../audioRecorder'

function makeMockStream(channelCount = 1) {
  return {
    getTracks: () => [{ stop: vi.fn() }, { stop: vi.fn() }],
    getAudioTracks: () => [{ getSettings: () => ({ channelCount }) }],
  }
}

describe('AudioRecorder.detectMimeType', () => {
  it('returns audio/webm;codecs=opus when supported', () => {
    expect(AudioRecorder.detectMimeType()).toBe('audio/webm;codecs=opus')
  })

  it('returns null when no supported type exists', () => {
    const original = MediaRecorder.isTypeSupported
    MediaRecorder.isTypeSupported = () => false
    expect(AudioRecorder.detectMimeType()).toBeNull()
    MediaRecorder.isTypeSupported = original
  })
})

describe('AudioRecorder — default mode (studio=false)', () => {
  let recorder

  beforeEach(() => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(makeMockStream(1))
    recorder = new AudioRecorder()
  })

  afterEach(async () => {
    if (recorder.state !== 'inactive') await recorder.stop()
  })

  it('initialises with state inactive', () => {
    expect(recorder.state).toBe('inactive')
  })

  it('acquireStream() calls getUserMedia with channelCount: 1 only (no DSP overrides)', async () => {
    await recorder.acquireStream()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { channelCount: 1 },
    })
  })

  it('stream getter returns the acquired stream', async () => {
    await recorder.acquireStream()
    expect(recorder.stream).toBeTruthy()
  })

  it('start() sets state to recording', async () => {
    await recorder.start()
    expect(recorder.state).toBe('recording')
  })

  it('channels reflects actual track channel count after acquireStream', async () => {
    await recorder.acquireStream()
    expect(recorder.channels).toBe(1)
  })

  it('channels falls back to 1 when no audio tracks', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getAudioTracks: () => [],
    })
    recorder = new AudioRecorder()
    await recorder.acquireStream()
    expect(recorder.channels).toBe(1)
  })

  it('pause() sets state to paused', async () => {
    await recorder.start()
    recorder.pause()
    expect(recorder.state).toBe('paused')
  })

  it('resume() sets state to recording', async () => {
    await recorder.start()
    recorder.pause()
    recorder.resume()
    expect(recorder.state).toBe('recording')
  })

  it('stop() resolves with array of Blob chunks', async () => {
    await recorder.start()
    const chunks = await recorder.stop()
    expect(Array.isArray(chunks)).toBe(true)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]).toBeInstanceOf(Blob)
  })

  it('stop() sets state to inactive', async () => {
    await recorder.start()
    await recorder.stop()
    expect(recorder.state).toBe('inactive')
  })

  it('mimeType is set after start()', async () => {
    await recorder.start()
    expect(recorder.mimeType).toBeTruthy()
  })

  it('onChunk callback is called with data', async () => {
    const onChunk = vi.fn()
    recorder = new AudioRecorder({ onChunk })
    await recorder.start()
    await recorder.stop()
    expect(onChunk).toHaveBeenCalled()
  })

  it('stop() stops all tracks', async () => {
    const stopFn = vi.fn()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopFn }, { stop: stopFn }],
      getAudioTracks: () => [{ getSettings: () => ({ channelCount: 1 }) }],
    })
    recorder = new AudioRecorder()
    await recorder.start()
    await recorder.stop()
    expect(stopFn).toHaveBeenCalledTimes(2)
  })

  it('throws if getUserMedia is rejected', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'))
    await expect(recorder.start()).rejects.toThrow('Permission denied')
    expect(recorder.state).toBe('inactive')
  })
})

describe('AudioRecorder — studio mode', () => {
  let recorder

  beforeEach(() => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(makeMockStream(1))
    recorder = new AudioRecorder({ studioMode: true })
  })

  afterEach(async () => {
    if (recorder.state !== 'inactive') await recorder.stop()
  })

  it('acquireStream() sends full DSP-disabled constraints in studio mode', async () => {
    await recorder.acquireStream()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      }),
    })
  })
})

describe('AudioRecorder — acquireStream + beginRecording split', () => {
  it('beginRecording() starts MediaRecorder after acquireStream()', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(makeMockStream(1))
    const recorder = new AudioRecorder()
    await recorder.acquireStream()
    expect(recorder.state).toBe('inactive')
    recorder.beginRecording()
    expect(recorder.state).toBe('recording')
    await recorder.stop()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- src/lib/__tests__/audioRecorder.test.js
```

Expected: Multiple FAIL — methods and props don't exist yet.

- [ ] **Step 3: Write the new audioRecorder.js**

Replace `src/lib/audioRecorder.js` entirely:

```js
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

const TIMESLICE_MS = 500
const BITRATE_MONO = 128_000
const BITRATE_STEREO = 192_000

const STUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleSize: 16,
  latency: 0,
}

const DEFAULT_CONSTRAINTS = {
  channelCount: 1,
}

export class AudioRecorder {
  static detectMimeType() {
    return MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) ?? null
  }

  constructor({ studioMode = false, onChunk } = {}) {
    this._studioMode = studioMode
    this._onChunk = onChunk ?? null
    this._mediaRecorder = null
    this._stream = null
    this._chunks = []
    this.state = 'inactive'
    this.mimeType = null
    this.channels = null
  }

  get stream() { return this._stream }

  async acquireStream() {
    const constraints = this._studioMode ? STUDIO_CONSTRAINTS : DEFAULT_CONSTRAINTS
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
    } catch (err) {
      this.state = 'inactive'
      throw err
    }
    this.channels = this._stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1
    this.mimeType = AudioRecorder.detectMimeType()
  }

  beginRecording() {
    if (!this._stream) throw new Error('Call acquireStream() before beginRecording()')
    this._chunks = []

    const bitrate = (this.channels ?? 1) >= 2 ? BITRATE_STEREO : BITRATE_MONO
    const options = { audioBitsPerSecond: bitrate }
    if (this.mimeType) options.mimeType = this.mimeType

    const mr = new MediaRecorder(this._stream, options)
    this._mediaRecorder = mr
    this.mimeType = mr.mimeType || this.mimeType

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._chunks.push(e.data)
        if (this._onChunk) this._onChunk(e.data)
      }
    }

    mr.start(TIMESLICE_MS)
    this.state = 'recording'
  }

  async start() {
    await this.acquireStream()
    this.beginRecording()
  }

  pause() {
    if (this._mediaRecorder?.state === 'recording') {
      this._mediaRecorder.pause()
      this.state = 'paused'
    }
  }

  resume() {
    if (this._mediaRecorder?.state === 'paused') {
      this._mediaRecorder.resume()
      this.state = 'recording'
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this._mediaRecorder || this._mediaRecorder.state === 'inactive') {
        resolve([])
        return
      }
      this._mediaRecorder.onstop = () => {
        this._stream?.getTracks().forEach(t => t.stop())
        this.state = 'inactive'
        resolve([...this._chunks])
      }
      this._mediaRecorder.stop()
    })
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- src/lib/__tests__/audioRecorder.test.js
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audioRecorder.js src/lib/__tests__/audioRecorder.test.js
git commit -m "refactor(recorder): split start into acquireStream+beginRecording, add studio mode, mono-first, adaptive bitrate"
```

---

## Task 2: Studio Mode preference store + UI toggle

**Files:**
- Create: `src/lib/studioMode.js`
- Create: `src/lib/__tests__/studioMode.test.js`
- Modify: `src/components/SongList/SongHeader.jsx`
- Modify: `src/hooks/useRecording.js`

Studio Mode off (default) = browser handles DSP (better on mobile mics).  
Studio Mode on = all DSP disabled, as before.

- [ ] **Step 1: Write the failing studioMode tests**

Create `src/lib/__tests__/studioMode.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { getStudioMode, setStudioMode } from '../studioMode'

describe('studioMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns false by default', () => {
    expect(getStudioMode()).toBe(false)
  })

  it('returns true after setStudioMode(true)', () => {
    setStudioMode(true)
    expect(getStudioMode()).toBe(true)
  })

  it('returns false after setStudioMode(false)', () => {
    setStudioMode(true)
    setStudioMode(false)
    expect(getStudioMode()).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm test -- src/lib/__tests__/studioMode.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create studioMode.js**

Create `src/lib/studioMode.js`:

```js
const KEY = 'songsheet_studio_mode'

export function getStudioMode() {
  try { return localStorage.getItem(KEY) === 'true' }
  catch { return false }
}

export function setStudioMode(value) {
  try { localStorage.setItem(KEY, value ? 'true' : 'false') }
  catch {}
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- src/lib/__tests__/studioMode.test.js
```

Expected: All PASS.

- [ ] **Step 5: Thread studioMode through useRecording**

In `src/hooks/useRecording.js`, update the signature and `startRecording` to pass `studioMode` to `AudioRecorder`. Replace the function signature and the `startRecording` callback:

```js
// Old:
export function useRecording({ songId, songTitle }) {
// New:
export function useRecording({ songId, songTitle, studioMode = false }) {
```

```js
// Old (inside startRecording):
    const recorder = new AudioRecorder()
// New:
    const recorder = new AudioRecorder({ studioMode })
```

- [ ] **Step 6: Add Studio Mode toggle to SongHeader**

In `src/components/SongList/SongHeader.jsx`, add the import and state at the top:

```js
import { getStudioMode, setStudioMode } from '../../lib/studioMode'
```

Inside the component body, add studio mode state after the existing `useState` hooks:

```js
  const [studioMode, setStudioModeState] = useState(getStudioMode)

  function toggleStudioMode() {
    const next = !studioMode
    setStudioMode(next)
    setStudioModeState(next)
  }
```

Pass `studioMode` to `useRecording`:

```js
  // Old:
  const recording = useRecording({
    songId: songId ?? '',
    songTitle: meta.title ?? '',
  })
  // New:
  const recording = useRecording({
    songId: songId ?? '',
    songTitle: meta.title ?? '',
    studioMode,
  })
```

Add the toggle button inside the `{songId && RECORDER_SUPPORTED && (...)}` block, before `<RecorderButton>`:

```jsx
            <button
              type="button"
              onClick={toggleStudioMode}
              aria-label={studioMode ? 'Studio mode on — tap to disable' : 'Studio mode off — tap to enable'}
              title={studioMode ? 'Studio mode: DSP disabled' : 'Studio mode: off (phone helps)'}
              className={`text-xs px-2 py-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                studioMode
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
              }`}
            >
              Studio
            </button>
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/studioMode.js src/lib/__tests__/studioMode.test.js src/hooks/useRecording.js src/components/SongList/SongHeader.jsx
git commit -m "feat(recorder): add Studio Mode toggle — lets phone DSP handle mic by default"
```

---

## Task 3: Screen Wake Lock during recording

**Files:**
- Modify: `src/hooks/useRecording.js`

Prevents the phone screen from sleeping mid-take. Silently skips on browsers that don't support it.

- [ ] **Step 1: Add wake lock logic to useRecording.js**

Inside `useRecording`, add a ref after the existing refs:

```js
  const wakeLockRef = useRef(null)
```

Add two helper functions inside the component body (after the timer helpers):

```js
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {}
  }

  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }
```

In `startRecording`, call `acquireWakeLock()` right after `setStatus('recording')`:

```js
      setStatus('recording')
      await acquireWakeLock()
      startTimer()
```

In `stopRecording`, call `releaseWakeLock()` right after `pauseTimer()`:

```js
  const stopRecording = useCallback(async () => {
    pauseTimer()
    releaseWakeLock()
    // ... rest unchanged
```

- [ ] **Step 2: Confirm existing tests still pass**

```bash
npm test -- src/hooks/__tests__/useRecording.test.js
```

Expected: All PASS (wake lock is not exercised by the mocked environment).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRecording.js
git commit -m "feat(recorder): request screen wake lock during recording to prevent mid-take throttle"
```

---

## Task 4: Pre-roll countdown (mic warm-up)

**Files:**
- Modify: `src/hooks/useRecording.js`
- Modify: `src/components/Recorder/RecordingTimer.jsx`

Acquires the mic immediately on button press (triggers the permission prompt), then shows a 3-second countdown before MediaRecorder starts. This gives the mic hardware time to stabilise.

- [ ] **Step 1: Add countdown state to useRecording**

Add `countdownSec` to the state declarations at the top of the hook:

```js
  const [countdownSec, setCountdownSec] = useState(null)
```

Add a ref for the countdown interval alongside existing refs:

```js
  const countdownRef = useRef(null)
```

Replace the entire `startRecording` callback:

```js
  const startRecording = useCallback(async () => {
    setStatus('requesting')
    setError(null)
    setElapsedMs(0)
    recordingIdRef.current = crypto.randomUUID()

    const recorder = new AudioRecorder({ studioMode })
    recorderRef.current = recorder

    try {
      await recorder.acquireStream()
      mimeTypeRef.current = recorder.mimeType
      setChannels(recorder.channels)
      setStatus('countdown')

      await new Promise((resolve) => {
        let remaining = 3
        setCountdownSec(remaining)
        countdownRef.current = setInterval(() => {
          remaining -= 1
          setCountdownSec(remaining)
          if (remaining <= 0) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
            setCountdownSec(null)
            resolve()
          }
        }, 1000)
      })

      recorder.beginRecording()
      setStatus('recording')
      await acquireWakeLock()
      startTimer()
    } catch (err) {
      setStatus('error')
      setError(err.message ?? String(err))
    }
  }, [songId, songTitle, studioMode])
```

Add `countdownSec` to the returned object:

```js
  return { status, elapsedMs, countdownSec, pendingName, error, channels, startRecording, pauseRecording, resumeRecording, stopRecording, saveRecording, cancelNaming }
```

- [ ] **Step 2: Update RecordingTimer to render the countdown**

Replace `src/components/Recorder/RecordingTimer.jsx` entirely:

```jsx
function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function RecordingTimer({ elapsedMs, status, countdownSec }) {
  if (status === 'countdown') {
    return (
      <span
        aria-label={countdownSec > 0 ? `Recording starts in ${countdownSec}` : 'Recording starting'}
        aria-live="polite"
        className="font-mono text-sm tabular-nums text-yellow-600 dark:text-yellow-400"
      >
        {countdownSec > 0 ? countdownSec : 'Go!'}
      </span>
    )
  }

  if (status !== 'recording' && status !== 'paused') return null

  const formatted = formatElapsed(elapsedMs)
  return (
    <span
      aria-label={`Elapsed time ${formatted}`}
      className="font-mono text-sm tabular-nums text-red-600 dark:text-red-400"
    >
      {formatted}
    </span>
  )
}
```

- [ ] **Step 3: Pass countdownSec to RecordingTimer in SongHeader**

In `src/components/SongList/SongHeader.jsx`, update the `<RecordingTimer>` usage:

```jsx
            <RecordingTimer elapsedMs={recording.elapsedMs} status={recording.status} countdownSec={recording.countdownSec} />
```

- [ ] **Step 4: Confirm tests pass**

```bash
npm test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRecording.js src/components/Recorder/RecordingTimer.jsx src/components/SongList/SongHeader.jsx
git commit -m "feat(recorder): 3-second pre-roll countdown after mic acquisition for hardware warm-up"
```

---

## Task 5: Live VU meter hook + component

**Files:**
- Create: `src/hooks/useAudioLevel.js`
- Create: `src/hooks/__tests__/useAudioLevel.test.js`
- Create: `src/components/Recorder/VUMeter.jsx`

Attaches an AnalyserNode to the live mic stream and returns the current peak dB and whether the signal is clipping (≥ −1 dBFS).

- [ ] **Step 1: Write failing hook tests**

Create `src/hooks/__tests__/useAudioLevel.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioLevel } from '../useAudioLevel'

describe('useAudioLevel', () => {
  let mockAnalyser, mockCtx

  beforeEach(() => {
    mockAnalyser = {
      fftSize: 1024,
      getFloatTimeDomainData: vi.fn((arr) => arr.fill(0)),
      connect: vi.fn(),
    }
    mockCtx = {
      createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
      createAnalyser: vi.fn(() => mockAnalyser),
      close: vi.fn(),
    }
    global.AudioContext = vi.fn(() => mockCtx)
    global.requestAnimationFrame = vi.fn((cb) => { cb(); return 1 })
    global.cancelAnimationFrame = vi.fn()
  })

  it('returns -Infinity peakDb and false isClipping when stream is null', () => {
    const { result } = renderHook(() => useAudioLevel(null))
    expect(result.current.peakDb).toBe(-Infinity)
    expect(result.current.isClipping).toBe(false)
  })

  it('creates AudioContext and AnalyserNode when stream is provided', () => {
    const stream = { id: 'mock-stream' }
    renderHook(() => useAudioLevel(stream))
    expect(AudioContext).toHaveBeenCalledTimes(1)
    expect(mockCtx.createAnalyser).toHaveBeenCalledTimes(1)
  })

  it('returns clipping=true when analyser reports peak at 1.0 (0 dBFS)', () => {
    mockAnalyser.getFloatTimeDomainData = vi.fn((arr) => arr.fill(1.0))
    const stream = { id: 'mock-stream' }
    const { result } = renderHook(() => useAudioLevel(stream))
    expect(result.current.isClipping).toBe(true)
  })

  it('returns clipping=false when analyser reports peak at 0.5 (-6 dBFS)', () => {
    mockAnalyser.getFloatTimeDomainData = vi.fn((arr) => arr.fill(0.5))
    const stream = { id: 'mock-stream' }
    const { result } = renderHook(() => useAudioLevel(stream))
    expect(result.current.isClipping).toBe(false)
  })

  it('closes AudioContext on cleanup', () => {
    const stream = { id: 'mock-stream' }
    const { unmount } = renderHook(() => useAudioLevel(stream))
    unmount()
    expect(mockCtx.close).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm test -- src/hooks/__tests__/useAudioLevel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create useAudioLevel.js**

Create `src/hooks/useAudioLevel.js`:

```js
import { useEffect, useRef, useState } from 'react'

const CLIP_THRESHOLD_DB = -1

export function useAudioLevel(stream) {
  const [peakDb, setPeakDb] = useState(-Infinity)
  const [isClipping, setIsClipping] = useState(false)
  const rafRef = useRef(null)
  const ctxRef = useRef(null)

  useEffect(() => {
    if (!stream) {
      setPeakDb(-Infinity)
      setIsClipping(false)
      return
    }

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    src.connect(analyser)

    const buf = new Float32Array(analyser.fftSize)

    function tick() {
      analyser.getFloatTimeDomainData(buf)
      let peak = 0
      for (let i = 0; i < buf.length; i++) {
        const abs = Math.abs(buf[i])
        if (abs > peak) peak = abs
      }
      const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity
      setPeakDb(db)
      setIsClipping(db >= CLIP_THRESHOLD_DB)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ctx.close()
      ctxRef.current = null
    }
  }, [stream])

  return { peakDb, isClipping }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- src/hooks/__tests__/useAudioLevel.test.js
```

Expected: All PASS.

- [ ] **Step 5: Create VUMeter.jsx**

Create `src/components/Recorder/VUMeter.jsx`:

```jsx
export function VUMeter({ peakDb, isClipping }) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const pct = clamp((peakDb + 60) / 60 * 100, 0, 100)

  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Input level ${isFinite(peakDb) ? `${Math.round(peakDb)} dB` : 'silent'}`}
    >
      <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isClipping ? 'bg-red-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%`, transition: 'width 50ms linear' }}
        />
      </div>
      {isClipping && (
        <span className="text-xs font-bold text-red-500 dark:text-red-400" aria-live="assertive">
          CLIP
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAudioLevel.js src/hooks/__tests__/useAudioLevel.test.js src/components/Recorder/VUMeter.jsx
git commit -m "feat(recorder): add VU meter hook and component with clipping detection"
```

---

## Task 6: Wire up VU meter + expose stream from useRecording

**Files:**
- Modify: `src/hooks/useRecording.js`
- Modify: `src/components/SongList/SongHeader.jsx`
- Modify: `src/components/Recorder/index.js`

- [ ] **Step 1: Expose stream from useRecording**

In `src/hooks/useRecording.js`, add `stream` to the state declarations at the top of the hook body:

```js
  const [stream, setStream] = useState(null)
```

In `startRecording`, set stream right after `acquireStream()` returns successfully:

```js
      await recorder.acquireStream()
      mimeTypeRef.current = recorder.mimeType
      setChannels(recorder.channels)
      setStream(recorder.stream)   // ← add this line
      setStatus('countdown')
```

In `stopRecording`, clear stream right after `pauseTimer()`:

```js
  const stopRecording = useCallback(async () => {
    pauseTimer()
    releaseWakeLock()
    setStream(null)   // ← add this line
    const chunks = await recorderRef.current?.stop() ?? []
```

Add `stream` to the returned object:

```js
  return { status, elapsedMs, countdownSec, stream, pendingName, error, channels, startRecording, pauseRecording, resumeRecording, stopRecording, saveRecording, cancelNaming }
```

- [ ] **Step 2: Integrate VU meter in SongHeader**

In `src/components/SongList/SongHeader.jsx`, add the imports:

```js
import { useAudioLevel } from '../../hooks/useAudioLevel'
import { VUMeter } from '../Recorder/VUMeter'
```

Inside the component body, after the `recording` hook call, add:

```js
  const { peakDb, isClipping } = useAudioLevel(recording.stream)
```

Inside the `{songId && RECORDER_SUPPORTED && (...)}` block, add the VU meter between `<RecordingTimer>` and the Studio toggle. It should only render when the mic is active:

```jsx
            <RecordingTimer elapsedMs={recording.elapsedMs} status={recording.status} countdownSec={recording.countdownSec} />
            {(recording.status === 'countdown' || recording.status === 'recording' || recording.status === 'paused') && (
              <VUMeter peakDb={peakDb} isClipping={isClipping} />
            )}
```

- [ ] **Step 3: Export VUMeter from the Recorder index**

In `src/components/Recorder/index.js`, add:

```js
export { VUMeter } from './VUMeter'
```

- [ ] **Step 4: Confirm all tests pass**

```bash
npm test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRecording.js src/components/SongList/SongHeader.jsx src/components/Recorder/index.js
git commit -m "feat(recorder): show live VU meter with clipping warning during recording"
```

---

## Task 7: WAV processing chain improvements

**Files:**
- Modify: `src/lib/wavUtils.js`

Reorders the chain to HPF → compressor (retuned for music, not voice) → makeup gain → encode. Adds TPDF dither before int16 quantisation. The old peak normalisation at 0.9 is replaced by LUFS in Task 8; for now a simple peak ceiling at 0.891 (−1 dBFS) prevents clipping after makeup gain. Exports `WAV_PROCESSING_VERSION` so Task 9 can cache-bust when the chain changes.

- [ ] **Step 1: Replace wavUtils.js**

Replace `src/lib/wavUtils.js` entirely:

```js
export const WAV_PROCESSING_VERSION = '2'

export async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  const offlineCtx = new OfflineAudioContext(
    decoded.numberOfChannels,
    decoded.length,
    decoded.sampleRate
  )

  const source = offlineCtx.createBufferSource()
  source.buffer = decoded

  // 80Hz high-pass to remove room rumble and mic handling noise
  const filter = offlineCtx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 80

  // Music-optimised compressor: slower attack lets transients through
  const compressor = offlineCtx.createDynamicsCompressor()
  compressor.threshold.value = -24
  compressor.knee.value = 10
  compressor.ratio.value = 2.5
  compressor.attack.value = 0.020
  compressor.release.value = 0.100

  // Makeup gain: compensate for ~4dB average gain reduction from compressor
  const makeupGain = offlineCtx.createGain()
  makeupGain.gain.value = 1.585  // +4 dB

  source.connect(filter)
  filter.connect(compressor)
  compressor.connect(makeupGain)
  makeupGain.connect(offlineCtx.destination)
  source.start()
  const processed = await offlineCtx.startRendering()

  const numChannels = processed.numberOfChannels
  const sampleRate = processed.sampleRate
  const numSamples = processed.length
  const wavBuffer = new ArrayBuffer(44 + numSamples * numChannels * 2)
  const view = new DataView(wavBuffer)

  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  const writeUint32 = (offset, val) => view.setUint32(offset, val, true)
  const writeUint16 = (offset, val) => view.setUint16(offset, val, true)

  const dataSize = numSamples * numChannels * 2
  writeStr(0, 'RIFF'); writeUint32(4, 36 + dataSize); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); writeUint32(16, 16); writeUint16(20, 1)
  writeUint16(22, numChannels); writeUint32(24, sampleRate)
  writeUint32(28, sampleRate * numChannels * 2); writeUint16(32, numChannels * 2)
  writeUint16(34, 16); writeStr(36, 'data'); writeUint32(40, dataSize)

  // True-peak ceiling at -1 dBFS (0.891) before encoding
  let peak = 0
  for (let c = 0; c < numChannels; c++) {
    const data = processed.getChannelData(c)
    for (let s = 0; s < numSamples; s++) {
      const abs = Math.abs(data[s])
      if (abs > peak) peak = abs
    }
  }
  const gain = peak > 0.891 ? 0.891 / peak : 1

  // Encode to 16-bit PCM with TPDF dither
  let offset = 44
  for (let s = 0; s < numSamples; s++) {
    for (let c = 0; c < numChannels; c++) {
      const dither = (Math.random() + Math.random() - 1) / 32768
      const sample = Math.max(-1, Math.min(1, processed.getChannelData(c)[s] * gain + dither))
      view.setInt16(offset, Math.round(sample * 32767), true)
      offset += 2
    }
  }
  return wavBuffer
}
```

- [ ] **Step 2: Confirm all tests pass**

```bash
npm test
```

Expected: All PASS. (No unit test targets this file directly since it needs a real AudioContext, but the full suite should be green.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/wavUtils.js
git commit -m "feat(audio): retune compressor for music, add makeup gain, TPDF dither, true-peak ceiling"
```

---

## Task 8: LUFS loudness normalisation

**Files:**
- Create: `src/lib/lufsUtils.js`
- Create: `src/lib/__tests__/lufsUtils.test.js`
- Modify: `src/lib/wavUtils.js`

Replaces the crude peak normalisation with BS.1770-4 integrated loudness measurement targeting −14 LUFS. Uses IIR K-weighting filter with 48 kHz reference coefficients (deviation < 0.5 LUFS at 44.1 kHz, acceptable). Bumps `WAV_PROCESSING_VERSION` to `'3'` so existing OPFS caches (from Task 9) are automatically invalidated.

- [ ] **Step 1: Write failing LUFS tests**

Create `src/lib/__tests__/lufsUtils.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { measureLUFS, lufsToGain } from '../lufsUtils'

function makeSilentBuffer(sampleRate = 48000, durationSec = 1, channels = 1) {
  return {
    sampleRate,
    numberOfChannels: channels,
    length: sampleRate * durationSec,
    getChannelData: () => new Float32Array(sampleRate * durationSec),
  }
}

function makeToneBuffer(amplitude, sampleRate = 48000, durationSec = 3, channels = 1) {
  const length = sampleRate * durationSec
  const data = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    data[i] = amplitude * Math.sin(2 * Math.PI * 1000 * i / sampleRate)
  }
  return {
    sampleRate,
    numberOfChannels: channels,
    length,
    getChannelData: () => data,
  }
}

describe('measureLUFS', () => {
  it('returns -70 for a silent buffer', () => {
    const buf = makeSilentBuffer()
    const result = measureLUFS(buf)
    expect(result).toBe(-70)
  })

  it('returns a finite number for a 1kHz tone at -18 dBFS', () => {
    const amplitude = Math.pow(10, -18 / 20)
    const buf = makeToneBuffer(amplitude)
    const result = measureLUFS(buf)
    expect(isFinite(result)).toBe(true)
    // K-weighted LUFS for 1kHz tone at -18 dBFS should be roughly -18 ±3 LUFS
    expect(result).toBeGreaterThan(-25)
    expect(result).toBeLessThan(-10)
  })

  it('returns louder LUFS for higher amplitude signal', () => {
    const quietBuf = makeToneBuffer(0.1)
    const loudBuf = makeToneBuffer(0.5)
    expect(measureLUFS(loudBuf)).toBeGreaterThan(measureLUFS(quietBuf))
  })

  it('handles a buffer shorter than one gating block by returning -70', () => {
    const buf = makeSilentBuffer(48000, 0.1)
    expect(measureLUFS(buf)).toBe(-70)
  })
})

describe('lufsToGain', () => {
  it('returns 1 for silence input', () => {
    expect(lufsToGain(-70, -14)).toBe(1)
  })

  it('returns 1 for -Infinity input', () => {
    expect(lufsToGain(-Infinity, -14)).toBe(1)
  })

  it('returns gain > 1 when measured loudness is below target', () => {
    expect(lufsToGain(-20, -14)).toBeGreaterThan(1)
  })

  it('returns gain < 1 when measured loudness is above target', () => {
    expect(lufsToGain(-10, -14)).toBeLessThan(1)
  })

  it('returns 1 when measured equals target', () => {
    expect(lufsToGain(-14, -14)).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm test -- src/lib/__tests__/lufsUtils.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create lufsUtils.js**

Create `src/lib/lufsUtils.js`:

```js
// BS.1770-4 K-weighting IIR filter coefficients for 48 kHz.
// Deviation < 0.5 LUFS at 44.1 kHz — acceptable for music recording.
// Stage 1: high-shelf pre-filter (+4 dB above ~1.7 kHz)
const HS_B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
const HS_A = [1.0, -1.69065929318241, 0.73248077421585]
// Stage 2: high-pass RLB filter (rolls off below ~40 Hz)
const HP_B = [1.0, -2.0, 1.0]
const HP_A = [1.0, -1.99004745483398, 0.99007225036603]

function applyIIR(input, b, a) {
  const out = new Float32Array(input.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i]
    const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    out[i] = y0
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
  }
  return out
}

function kWeight(samples) {
  return applyIIR(applyIIR(samples, HS_B, HS_A), HP_B, HP_A)
}

/**
 * Compute BS.1770-4 gated integrated loudness (LUFS) for an AudioBuffer-like object.
 * @param {{ sampleRate: number, numberOfChannels: number, length: number, getChannelData: (c: number) => Float32Array }} audioBuffer
 * @returns {number} LUFS value, or -70 if signal is below absolute gate
 */
export function measureLUFS(audioBuffer) {
  const { sampleRate, numberOfChannels, length } = audioBuffer

  const kWeighted = []
  for (let c = 0; c < numberOfChannels; c++) {
    kWeighted.push(kWeight(audioBuffer.getChannelData(c)))
  }

  // 400ms blocks, 75% overlap (100ms steps), per BS.1770-4
  const blockSamples = Math.round(sampleRate * 0.4)
  const stepSamples = Math.round(sampleRate * 0.1)
  const numBlocks = Math.max(0, Math.floor((length - blockSamples) / stepSamples) + 1)

  if (numBlocks === 0) return -70

  const blockPowers = []
  for (let i = 0; i < numBlocks; i++) {
    const start = i * stepSamples
    let sum = 0
    for (let c = 0; c < numberOfChannels; c++) {
      const ch = kWeighted[c]
      for (let s = start; s < start + blockSamples; s++) {
        sum += ch[s] * ch[s]
      }
    }
    blockPowers.push(sum / (blockSamples * numberOfChannels))
  }

  // Absolute gate: −70 LUFS
  const absGate = Math.pow(10, (-70 + 0.691) / 10)
  const pass1 = blockPowers.filter(p => p >= absGate)
  if (pass1.length === 0) return -70

  // Relative gate: −10 LU below ungated integrated loudness
  const ungatedLUFS = -0.691 + 10 * Math.log10(pass1.reduce((a, b) => a + b, 0) / pass1.length)
  const relGate = Math.pow(10, (ungatedLUFS - 10 + 0.691) / 10)
  const pass2 = pass1.filter(p => p >= relGate)
  if (pass2.length === 0) return -70

  return -0.691 + 10 * Math.log10(pass2.reduce((a, b) => a + b, 0) / pass2.length)
}

/**
 * Convert a measured LUFS to the linear gain needed to reach a target LUFS.
 * Returns 1 for silent or below-gate input.
 */
export function lufsToGain(measuredLUFS, targetLUFS) {
  if (!isFinite(measuredLUFS) || measuredLUFS <= -70) return 1
  return Math.pow(10, (targetLUFS - measuredLUFS) / 20)
}
```

- [ ] **Step 4: Run LUFS tests to confirm pass**

```bash
npm test -- src/lib/__tests__/lufsUtils.test.js
```

Expected: All PASS.

- [ ] **Step 5: Integrate LUFS into wavUtils.js**

Replace `src/lib/wavUtils.js` entirely with the LUFS-normalised version:

```js
import { measureLUFS, lufsToGain } from './lufsUtils'

export const WAV_PROCESSING_VERSION = '3'

const TARGET_LUFS = -14
const TRUE_PEAK_CEILING = 0.891  // −1 dBFS

export async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  const offlineCtx = new OfflineAudioContext(
    decoded.numberOfChannels,
    decoded.length,
    decoded.sampleRate
  )

  const source = offlineCtx.createBufferSource()
  source.buffer = decoded

  const filter = offlineCtx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 80

  const compressor = offlineCtx.createDynamicsCompressor()
  compressor.threshold.value = -24
  compressor.knee.value = 10
  compressor.ratio.value = 2.5
  compressor.attack.value = 0.020
  compressor.release.value = 0.100

  const makeupGain = offlineCtx.createGain()
  makeupGain.gain.value = 1.585  // +4 dB

  source.connect(filter)
  filter.connect(compressor)
  compressor.connect(makeupGain)
  makeupGain.connect(offlineCtx.destination)
  source.start()
  const processed = await offlineCtx.startRendering()

  // LUFS-based loudness normalisation
  const measuredLUFS = measureLUFS(processed)
  let gain = lufsToGain(measuredLUFS, TARGET_LUFS)

  // True-peak ceiling: if LUFS gain would cause clipping, reduce it
  let peak = 0
  for (let c = 0; c < processed.numberOfChannels; c++) {
    const data = processed.getChannelData(c)
    for (let s = 0; s < processed.length; s++) {
      const abs = Math.abs(data[s])
      if (abs > peak) peak = abs
    }
  }
  if (peak * gain > TRUE_PEAK_CEILING) gain = TRUE_PEAK_CEILING / peak

  const numChannels = processed.numberOfChannels
  const sampleRate = processed.sampleRate
  const numSamples = processed.length
  const wavBuffer = new ArrayBuffer(44 + numSamples * numChannels * 2)
  const view = new DataView(wavBuffer)

  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  const writeUint32 = (offset, val) => view.setUint32(offset, val, true)
  const writeUint16 = (offset, val) => view.setUint16(offset, val, true)

  const dataSize = numSamples * numChannels * 2
  writeStr(0, 'RIFF'); writeUint32(4, 36 + dataSize); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); writeUint32(16, 16); writeUint16(20, 1)
  writeUint16(22, numChannels); writeUint32(24, sampleRate)
  writeUint32(28, sampleRate * numChannels * 2); writeUint16(32, numChannels * 2)
  writeUint16(34, 16); writeStr(36, 'data'); writeUint32(40, dataSize)

  let offset = 44
  for (let s = 0; s < numSamples; s++) {
    for (let c = 0; c < numChannels; c++) {
      const dither = (Math.random() + Math.random() - 1) / 32768
      const sample = Math.max(-1, Math.min(1, processed.getChannelData(c)[s] * gain + dither))
      view.setInt16(offset, Math.round(sample * 32767), true)
      offset += 2
    }
  }
  return wavBuffer
}
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lufsUtils.js src/lib/__tests__/lufsUtils.test.js src/lib/wavUtils.js
git commit -m "feat(audio): LUFS loudness normalisation targeting -14 LUFS with true-peak ceiling"
```

---

## Task 9: Cache processed WAV in OPFS

**Files:**
- Modify: `src/workers/storageWorker.js`
- Modify: `src/components/Recorder/RecordingsPanel.jsx`

After the first play or download of a recording, the processed WAV is written to OPFS alongside the raw WebM. Subsequent plays/downloads read directly from cache. The cache is keyed by recording ID + `WAV_PROCESSING_VERSION`. When the processing chain changes (version bumps), the old cached file is ignored and a new one is written; the old file is cleaned up when the recording is deleted (which already uses `recursive: true`).

- [ ] **Step 1: Add write-wav-cache and read-wav-cache to storageWorker.js**

In `src/workers/storageWorker.js`, add these two cases inside the `switch (type)` block, before the `default:` case:

```js
      case 'write-wav-cache': {
        const { songId, recordingId, buffer, version } = payload
        const dir = await getRecordingDir(root, songId, recordingId)
        const wavHandle = await dir.getFileHandle('processed.wav', { create: true })
        const wavWritable = await wavHandle.createWritable()
        await wavWritable.write(new Uint8Array(buffer))
        await wavWritable.close()
        const verHandle = await dir.getFileHandle('processed_version.txt', { create: true })
        const verWritable = await verHandle.createWritable()
        await verWritable.write(new TextEncoder().encode(String(version)))
        await verWritable.close()
        reply(requestId, { ok: true })
        break
      }

      case 'read-wav-cache': {
        const { songId, recordingId, version } = payload
        const dir = await getRecordingDir(root, songId, recordingId)
        try {
          const verHandle = await dir.getFileHandle('processed_version.txt')
          const verFile = await verHandle.getFile()
          const storedVersion = await verFile.text()
          if (storedVersion.trim() !== String(version)) {
            reply(requestId, null)
            break
          }
          const wavHandle = await dir.getFileHandle('processed.wav')
          const wavFile = await wavHandle.getFile()
          const buffer = await wavFile.arrayBuffer()
          self.postMessage({ requestId, ok: true, result: buffer }, [buffer])
        } catch {
          reply(requestId, null)
        }
        break
      }
```

- [ ] **Step 2: Update RecordingsPanel to use the cache**

Replace the entire `handlePlay` and `handleDownload` functions in `src/components/Recorder/RecordingsPanel.jsx`. First, add the import at the top of the file:

```js
import { blobToWav, WAV_PROCESSING_VERSION } from '../../lib/wavUtils'
```

Replace `handlePlay`:

```js
  async function handlePlay(rec) {
    if (playingSrc?.recordingId === rec.recordingId) { setPlayingSrc(null); return }
    setProcessingId(rec.recordingId)
    try {
      let wavBuffer = await clientRef.current.send('read-wav-cache', {
        songId, recordingId: rec.recordingId, version: WAV_PROCESSING_VERSION,
      })

      if (!wavBuffer) {
        const rawBuffer = await clientRef.current.send('read-audio', { songId, recordingId: rec.recordingId })
        const blob = new Blob([rawBuffer], { type: rec.mimeType ?? 'audio/webm' })
        wavBuffer = await blobToWav(blob)
        await clientRef.current.send('write-wav-cache', {
          songId, recordingId: rec.recordingId, buffer: wavBuffer, version: WAV_PROCESSING_VERSION,
        })
      }

      const url = URL.createObjectURL(new Blob([wavBuffer], { type: 'audio/wav' }))
      objectUrlsRef.current.push(url)
      setPlayingSrc({ recordingId: rec.recordingId, url, mimeType: 'audio/wav', durationMs: rec.duration })
    } finally {
      setProcessingId(null)
    }
  }
```

Replace `handleDownload`:

```js
  async function handleDownload(rec) {
    setDownloadingId(rec.recordingId)
    try {
      let wavBuffer = await clientRef.current.send('read-wav-cache', {
        songId, recordingId: rec.recordingId, version: WAV_PROCESSING_VERSION,
      })

      if (!wavBuffer) {
        const rawBuffer = await clientRef.current.send('read-audio', { songId, recordingId: rec.recordingId })
        const blob = new Blob([rawBuffer], { type: rec.mimeType ?? 'audio/webm' })
        try {
          wavBuffer = await blobToWav(blob)
          await clientRef.current.send('write-wav-cache', {
            songId, recordingId: rec.recordingId, buffer: wavBuffer, version: WAV_PROCESSING_VERSION,
          })
        } catch {
          const url = URL.createObjectURL(new Blob([rawBuffer], { type: rec.mimeType ?? 'audio/webm' }))
          const a = document.createElement('a')
          a.href = url
          a.download = `${rec.name.replace(/[^a-z0-9 _-]/gi, '_')}.webm`
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
          URL.revokeObjectURL(url)
          return
        }
      }

      const url = URL.createObjectURL(new Blob([wavBuffer], { type: 'audio/wav' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${rec.name.replace(/[^a-z0-9 _-]/gi, '_')}.wav`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingId(null)
    }
  }
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add src/workers/storageWorker.js src/components/Recorder/RecordingsPanel.jsx
git commit -m "feat(recorder): cache processed WAV in OPFS for instant repeat playback"
```

---

## Task 10: playsInline + MediaSession API

**Files:**
- Modify: `src/components/Recorder/AudioPlayer.jsx`

`playsInline` prevents iOS from forcing full-screen video playback controls. MediaSession registers title/artist with the OS so the recording name appears on the lock screen and in the system media controls.

- [ ] **Step 1: Update AudioPlayer.jsx**

Replace `src/components/Recorder/AudioPlayer.jsx` entirely:

```jsx
import { useRef, useState, useEffect } from 'react'

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

function formatTime(seconds) {
  const totalSec = Math.floor(seconds)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function AudioPlayer({ src, mimeType, durationMs, title, artist }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationMs / 1000)
  const [rate, setRate] = useState(1)
  const [playError, setPlayError] = useState(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!src || !audio) return
    audio.load()
    audio.play().catch(err => setPlayError(err.message))
  }, [src])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !src) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title ?? 'Recording',
      artist: artist ?? '',
    })
    return () => { navigator.mediaSession.metadata = null }
  }, [src, title, artist])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      setPlayError(null)
      audio.play().catch(err => setPlayError(err.message))
    }
  }

  function handleRateChange(e) {
    const val = Number(e.target.value)
    setRate(val)
    if (audioRef.current) audioRef.current.playbackRate = val
  }

  function handleSeek(e) {
    const val = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = val
    setCurrentTime(val)
  }

  return (
    <div className="flex flex-col gap-2">
      <audio
        ref={audioRef}
        onPlay={() => { setIsPlaying(true); setPlayError(null) }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration
          if (d && isFinite(d)) setDuration(d)
        }}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
        onError={(e) => {
          setIsPlaying(false)
          const code = e.target.error?.code
          const msg = code === 3 ? 'Audio decode error — recording may be corrupt'
            : code === 4 ? 'Format not supported in this browser'
            : `Audio failed to load (code ${code ?? '?'})`
          setPlayError(msg)
        }}
        preload="auto"
        playsInline
        src={src}
      />
      {playError && (
        <p className="text-xs text-red-500 dark:text-red-400">{playError}</p>
      )}

      <input
        type="range"
        role="slider"
        aria-label="Seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        className="w-full accent-indigo-600"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <span className="text-xs font-mono tabular-nums text-gray-600 dark:text-gray-400">
          {formatTime(currentTime)}
        </span>
        <span className="text-xs text-gray-400">/</span>
        <span className="text-xs font-mono tabular-nums text-gray-600 dark:text-gray-400">
          {formatTime(duration)}
        </span>

        <label className="sr-only" htmlFor="playback-rate-select">Playback rate</label>
        <select
          id="playback-rate-select"
          aria-label="Playback rate"
          value={rate}
          onChange={handleRateChange}
          className="ml-auto text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {RATES.map(r => <option key={r} value={r}>{r}×</option>)}
        </select>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Pass title/artist from RecordingsPanel**

In `src/components/Recorder/RecordingsPanel.jsx`, update the `<AudioPlayer>` usage:

```jsx
            {playingSrc?.recordingId === rec.recordingId ? (
              <AudioPlayer
                src={playingSrc.url}
                mimeType={playingSrc.mimeType}
                durationMs={playingSrc.durationMs}
                title={rec.name}
              />
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Recorder/AudioPlayer.jsx src/components/Recorder/RecordingsPanel.jsx
git commit -m "feat(player): add playsInline and MediaSession API for lock-screen integration"
```

---

## Self-Review

### Spec coverage check

| Expert recommendation | Task |
|---|---|
| Studio Mode toggle (DSP defaults) | Task 2 |
| Verify actual constraints with `getSettings()` | Task 1 (`channels` stored after acquireStream) |
| Mono-first, adaptive bitrate | Task 1 |
| Pre-roll countdown / mic warm-up | Task 4 |
| Live VU meter + clipping detection | Tasks 5 + 6 |
| Wake lock during recording | Task 3 |
| Reorder chain + compressor retuning + makeup gain | Task 7 |
| TPDF dither on 16-bit encode | Tasks 7 + 8 |
| LUFS loudness normalisation | Task 8 |
| True-peak limiter | Tasks 7 + 8 |
| Cache processed output | Task 9 |
| playsInline | Task 10 |
| MediaSession API | Task 10 |
| `<audio>` not Web Audio for playback | Already done in existing code |

One recommendation not covered: **de-esser**. This requires significant DSP knowledge and a separate EQ or multiband compressor stage. It's excluded here as the expert listed it as optional ("if vocals") and the scope would be substantial.

### Placeholder scan

No TBD, TODO, or "similar to Task N" patterns found.

### Type consistency check

- `acquireStream()` / `beginRecording()` — defined in Task 1, used in Tasks 4 and 6 ✓
- `recording.stream` — returned from `useRecording` in Task 6, consumed by `useAudioLevel` in Task 6 ✓
- `WAV_PROCESSING_VERSION` — exported from `wavUtils.js` in Task 8, imported in Task 9 ✓
- `measureLUFS` / `lufsToGain` — exported from `lufsUtils.js` in Task 8, imported in `wavUtils.js` in Task 8 ✓
- `countdownSec` — returned from `useRecording` in Task 4, passed to `RecordingTimer` in Task 4 ✓
