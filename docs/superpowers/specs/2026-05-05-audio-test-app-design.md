# Audio Recording Test App — Design Spec

## Goal

A single self-contained HTML file (`experiments/audio-test.html`) that lets us validate the expert-recommended audio recording improvements before porting them into the main songbook app. Record once, hear both the current processing chain and the new chain side by side, download either as WAV.

## How to run

```bash
npx serve .
# then open http://localhost:3000/experiments/audio-test.html
```

`getUserMedia` requires a secure context (HTTPS or localhost). No npm install, no build step.

---

## Architecture

Three logical layers, all inline in a single HTML file:

| Layer | Responsibility |
|---|---|
| **Recorder** | `getUserMedia`, 3-second countdown, `MediaRecorder` capture, VU meter via `AnalyserNode` |
| **Processor** | Two pure async functions: `processOld(buffer)` and `processNew(buffer)`, each returning `{ wavBuffer: ArrayBuffer, stats: object }` |
| **UI** | DOM state machine across four phases: idle → countdown → recording → comparing |

---

## UI Phases

### Phase 1 — Idle

```
┌─────────────────────────────────────────┐
│  🎙 Audio Recording Test                │
│                                         │
│  [Studio Mode]  [● Record]              │
│                                         │
└─────────────────────────────────────────┘
```

- Studio Mode toggle visible and interactive.
- Record button triggers mic permission prompt immediately.

### Phase 2 — Countdown (3 seconds)

Mic is acquired and warming up. A large countdown number (3 → 2 → 1) is shown. VU meter is live so the user can see the mic is working. Record button changes to a Stop button (early stop cancels the recording and returns to idle).

```
│  [Studio Mode]  [■ Stop]               │
│  ████░░░░░░░░  3                        │
│  (VU meter)    (countdown)              │
│  Mono · 128 kbps · browser DSP on      │
```

The info line shows actual settings read from `track.getSettings()` after `getUserMedia` resolves.

### Phase 3 — Recording

MediaRecorder is running. Timer counts up. VU meter is live.

```
│  [Studio Mode ◆]  [■ Stop]  [⏸ Pause] │
│  ████░░░░░░░░  CLIP?   0:42            │
│  (VU meter)   (warn)   (timer)         │
│  Mono · 128 kbps · browser DSP on      │
```

### Phase 4 — Comparing

After Stop is pressed both chains process in parallel. A spinner covers the comparison area until both resolve. Then:

```
┌──────────────────┬──────────────────────┐
│  Current (v1)    │  New (v2)            │
│  ──────────────  │  ──────────────      │
│  [▶ audio player]│  [▶ audio player]   │
│  [↓ Download WAV]│  [↓ Download WAV]   │
│                  │                      │
│  Peak-norm: 0.9  │  LUFS: −14.2         │
│  4:1 · 5ms atk   │  2.5:1 · 20ms atk   │
└──────────────────┴──────────────────────┘
         [● Record again]
```

`Record again` revokes both object URLs, clears both players, and returns to idle.

---

## Recorder

### getUserMedia constraints

**Studio Mode OFF (default):**
```js
{ audio: { channelCount: 1 } }
```
Browser DSP (echoCancellation, noiseSuppression, autoGainControl) left at browser defaults — on mobile this typically gives better results for singing.

**Studio Mode ON:**
```js
{ audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    sampleSize: 16,
    latency: 0,
} }
```

After `getUserMedia` resolves, read actual settings via `track.getSettings()` and display: channel count, and whether each DSP flag is active.

### Adaptive bitrate

Read actual `channelCount` from `track.getSettings()` after stream is acquired:
- Mono (1 channel): 128 kbps
- Stereo (2 channels): 192 kbps

### Countdown

After `getUserMedia` resolves (mic warm-up phase):
1. Start VU meter on the live stream.
2. Show countdown: 3 → 2 → 1 at 1-second intervals.
3. After countdown, call `mediaRecorder.start(500)` (500ms timeslice).
4. Switch UI to recording phase.

### VU meter

`AnalyserNode` attached to a `MediaStreamSource` on the live stream. `requestAnimationFrame` loop calls `getFloatTimeDomainData`, finds the peak absolute value, converts to dB. A horizontal bar maps −60 dBFS → 0 dBFS to 0 → 100% width. Bar turns red and a "CLIP" label appears when peak ≥ −1 dBFS.

### Wake lock

`navigator.wakeLock.request('screen')` after countdown completes. Released when recording stops. Silently skipped if the API is unavailable.

### Pause / Resume

`mediaRecorder.pause()` / `mediaRecorder.resume()` — chunks continue to accumulate across pauses. Timer freezes on pause, resumes on resume. VU meter stays live.

### Stop

`mediaRecorder.stop()` → wait for `onstop` event → collect all chunks into a single `Uint8Array` → run `processOld` and `processNew` in parallel via `Promise.all` → show comparison phase.

If either chain throws (e.g. `decodeAudioData` fails), that player shows a plain error message ("Processing failed") and its download button is hidden. The other player is unaffected.

---

## Processing Chains

Both functions are pure: same input `ArrayBuffer`, independent `AudioContext` instances, no shared state.

### processOld(buffer) — current app chain

Replicates exactly what the songbook app does today, so the comparison is "what's shipping" vs "what we're proposing".

```
decodeAudioData
  → OfflineAudioContext
    → BiquadFilter: highpass, 80 Hz
    → DynamicsCompressor: threshold −24, knee 10, ratio 4, attack 0.005, release 0.15
  → peak scan all channels
  → gain = 0.9 / peak  (peak-norm to 0.9)
  → 16-bit PCM RIFF WAV encoder (hand-written DataView, same as current app)
```

Stats returned: `{ peakNorm: 0.9, ratio: 4, attackMs: 5 }`

### processNew(buffer) — improved chain

```
decodeAudioData
  → OfflineAudioContext
    → BiquadFilter: highpass, 80 Hz
    → DynamicsCompressor: threshold −24, knee 10, ratio 2.5, attack 0.020, release 0.100
    → GainNode: +4 dB (1.585 linear) makeup gain
  → LUFS measurement: BS.1770-4 K-weighting IIR (48 kHz reference coefficients) + gated integrated loudness
  → LUFS gain: 10^((−14 − measuredLUFS) / 20)
  → True-peak ceiling: if peak × gain > 0.891, reduce gain to 0.891 / peak
  → TPDF dither: (Math.random() + Math.random() − 1) / 32768 added per sample
  → 16-bit PCM RIFF WAV encoder
```

Stats returned: `{ measuredLUFS: number, targetLUFS: −14, ratio: 2.5, attackMs: 20 }`

### LUFS measurement (inline JS, ~60 lines)

K-weighting is a two-stage IIR filter applied per channel to the processed `AudioBuffer` samples:
- Stage 1: high-shelf pre-filter (48 kHz coefficients from ITU-R BS.1770-4)
- Stage 2: high-pass RLB filter (48 kHz coefficients from ITU-R BS.1770-4)

Gated integrated loudness:
1. 400ms blocks, 75% overlap (100ms steps)
2. Absolute gate: −70 LUFS
3. Relative gate: −10 LU below ungated mean
4. Return `−0.691 + 10 × log10(mean power of gated blocks)`

---

## WAV Encoder

Hand-written, identical in both chains. 44-byte RIFF header + interleaved 16-bit signed PCM, little-endian. Shared as a module-level function `encodeWav(audioBuffer, gain, dither)` called by both chains.

---

## Styling

Tailwind CSS via CDN Play script (`<script src="https://cdn.tailwindcss.com">`). Dark mode via `class` strategy (`dark` on `<html>`). No custom CSS needed.

---

## File location

```
experiments/
  audio-test.html    ← the entire app
```

A comment at line 1 of the file:
```html
<!-- Run: npx serve . → open http://localhost:3000/experiments/audio-test.html -->
```

---

## Out of scope

- Persistence (OPFS, localStorage) — one recording in memory only
- Multiple recordings — re-record replaces the current one
- De-esser — excluded per expert advice (optional, complex)
- Album upload — this is a test tool, not a sharing tool
