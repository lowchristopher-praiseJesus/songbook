# Audio Recording Test App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `experiments/audio-test.html` — a single-file browser app that records audio, runs two processing chains in parallel, and plays back both side by side for quality comparison.

**Architecture:** One HTML file, Tailwind CDN for styling, all logic in a single `<script>` block organised into labelled sections. No npm, no build step. A phase state machine (`idle → countdown → recording → processing → done`) drives show/hide of DOM sections. Both processing chains (`processOld`, `processNew`) receive the same raw `ArrayBuffer` and resolve independently.

**Tech Stack:** Vanilla JS, MediaRecorder API, Web Audio API (AudioContext, OfflineAudioContext, AnalyserNode), Screen Wake Lock API, Tailwind CSS Play CDN

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `experiments/audio-test.html` | Create | The entire app — HTML structure + all JS in one `<script>` block |

## How to run (used in every verification step)

```bash
npx serve .
# Open: http://localhost:3000/experiments/audio-test.html
```

`getUserMedia` requires a secure context (HTTPS or localhost). No other setup needed.

---

## Task 1: HTML scaffold + phase state machine

Creates the complete DOM structure. All UI sections exist from the start — the phase machine shows/hides them. No recording functionality yet.

**Files:**
- Create: `experiments/audio-test.html`

- [ ] **Step 1: Create the experiments directory and file**

```bash
mkdir -p experiments
```

Create `experiments/audio-test.html` with this complete content:

```html
<!-- Run: npx serve . → open http://localhost:3000/experiments/audio-test.html -->
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>🎙 Audio Recording Test</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen p-6 max-w-2xl mx-auto">

  <h1 class="text-2xl font-bold mb-1">🎙 Audio Recording Test</h1>
  <p class="text-xs text-gray-500 mb-6">Record once · compare current vs new processing side by side</p>

  <!-- CONTROLS — visible in idle, countdown, recording -->
  <div id="controls" class="flex flex-wrap items-center gap-3 mb-4">
    <button id="btn-studio"
      class="text-xs px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500">
      Studio Mode
    </button>
    <button id="btn-record"
      class="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium focus:outline-none focus:ring-2 focus:ring-red-500">
      ● Record
    </button>
  </div>

  <!-- CAPTURE STATUS — visible during countdown + recording -->
  <div id="capture-status" class="hidden flex flex-wrap items-center gap-4 mb-3">
    <div class="flex items-center gap-2" aria-label="Input level">
      <div class="w-24 h-3 bg-gray-700 rounded-full overflow-hidden">
        <div id="vu-bar" class="h-full rounded-full bg-green-500 w-0"></div>
      </div>
      <span id="clip-label" class="hidden text-xs font-bold text-red-400">CLIP</span>
    </div>
    <span id="countdown-display" class="hidden text-3xl font-bold text-yellow-400 tabular-nums w-8 text-center"></span>
    <span id="timer-display"    class="hidden font-mono text-sm text-red-400 tabular-nums"></span>
    <div class="flex gap-2">
      <button id="btn-pause"  class="hidden text-xs px-2 py-1 rounded border border-yellow-600 text-yellow-400 hover:bg-yellow-900/20">⏸ Pause</button>
      <button id="btn-resume" class="hidden text-xs px-2 py-1 rounded border border-green-600  text-green-400  hover:bg-green-900/20">▶ Resume</button>
      <button id="btn-stop"   class="hidden text-xs px-2 py-1 rounded border border-gray-600   text-gray-300   hover:bg-gray-700">⏹ Stop</button>
    </div>
  </div>

  <!-- SETTINGS INFO — visible during countdown + recording -->
  <p id="settings-info" class="hidden text-xs text-gray-500 mb-4"></p>

  <!-- PROCESSING SPINNER -->
  <p id="spinner" class="hidden text-gray-400 text-sm mb-4 animate-pulse">⏳ Processing both versions…</p>

  <!-- COMPARISON — visible when done -->
  <div id="comparison" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
    <div class="bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <h2 class="font-semibold text-sm text-gray-300">Current (v1)</h2>
      <p id="old-error" class="hidden text-xs text-red-400">Processing failed</p>
      <audio id="old-player" controls playsInline class="w-full hidden"></audio>
      <p id="old-stats" class="text-xs text-gray-500 leading-relaxed whitespace-pre-line"></p>
      <button id="btn-dl-old" class="hidden text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 self-start">↓ Download WAV</button>
    </div>
    <div class="bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <h2 class="font-semibold text-sm text-indigo-300">New (v2)</h2>
      <p id="new-error" class="hidden text-xs text-red-400">Processing failed</p>
      <audio id="new-player" controls playsInline class="w-full hidden"></audio>
      <p id="new-stats" class="text-xs text-gray-500 leading-relaxed whitespace-pre-line"></p>
      <button id="btn-dl-new" class="hidden text-xs px-3 py-1.5 rounded-lg border border-indigo-700 text-indigo-300 hover:bg-indigo-900/20 self-start">↓ Download WAV</button>
    </div>
  </div>
  <button id="btn-again" class="hidden text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium">
    ● Record again
  </button>

  <script>
    // ── Helpers ──────────────────────────────────────────────────────────────

    function show(id, condition = true) {
      document.getElementById(id).classList.toggle('hidden', !condition)
    }
    function hide(id) { show(id, false) }

    // ── Phase state machine ──────────────────────────────────────────────────
    // Phases: 'idle' | 'countdown' | 'recording' | 'processing' | 'done'

    let phase = 'idle'

    function setPhase(p) {
      phase = p
      const capturing = p === 'countdown' || p === 'recording'
      show('controls',          p === 'idle' || capturing)
      show('capture-status',    capturing)
      show('settings-info',     capturing)
      show('countdown-display', p === 'countdown')
      show('timer-display',     p === 'recording')
      show('btn-pause',         p === 'recording')
      show('btn-stop',          capturing)
      show('spinner',           p === 'processing')
      show('comparison',        p === 'done')
      show('btn-again',         p === 'done')
      hide('btn-resume')
    }

    setPhase('idle')
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Run `npx serve .` and open `http://localhost:3000/experiments/audio-test.html`.

Verify:
- Dark page loads with heading and subtitle
- Studio Mode button and ● Record button visible
- Nothing else visible — no VU meter, no timer, no players
- No console errors

- [ ] **Step 3: Commit**

```bash
git add experiments/audio-test.html
git commit -m "feat(test-app): scaffold HTML structure and phase state machine"
```

---

## Task 2: Studio Mode toggle

Adds `studioMode` boolean and wires the toggle button with active/inactive visual states.

**Files:**
- Modify: `experiments/audio-test.html` — add inside `<script>` after `setPhase('idle')`

- [ ] **Step 1: Add Studio Mode state and handler**

Inside the `<script>` block, after `setPhase('idle')`, add:

```js
    // ── Studio Mode ──────────────────────────────────────────────────────────

    let studioMode = false

    function renderStudioBtn() {
      const btn = document.getElementById('btn-studio')
      if (studioMode) {
        btn.textContent = 'Studio Mode ◆'
        btn.className = 'text-xs px-3 py-1.5 rounded-lg border border-indigo-500 bg-indigo-900/30 text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500'
      } else {
        btn.textContent = 'Studio Mode'
        btn.className = 'text-xs px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'
      }
    }

    document.getElementById('btn-studio').addEventListener('click', () => {
      studioMode = !studioMode
      renderStudioBtn()
    })

    renderStudioBtn()
```

- [ ] **Step 2: Verify in browser**

Refresh. Click Studio Mode:
- Button turns indigo with ◆ suffix
- Click again — returns to grey "Studio Mode"
- No console errors

- [ ] **Step 3: Commit**

```bash
git add experiments/audio-test.html
git commit -m "feat(test-app): Studio Mode toggle with active/inactive visual states"
```

---

## Task 3: Mic acquisition + VU meter + countdown

Wires the Record button end-to-end through to the recording phase entry point. `startRecording` is a one-line stub here — fully implemented in Task 4.

**Files:**
- Modify: `experiments/audio-test.html`

- [ ] **Step 1: Add mic acquisition, VU meter, and countdown**

After the Studio Mode section, add:

```js
    // ── Constants ────────────────────────────────────────────────────────────

    const STUDIO_CONSTRAINTS = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      sampleSize: 16,
      latency: 0,
    }
    const DEFAULT_CONSTRAINTS = { channelCount: 1 }
    const BITRATE_MONO    = 128_000
    const BITRATE_STEREO  = 192_000

    // ── Recorder state ───────────────────────────────────────────────────────

    let micStream       = null
    let mediaRecorder   = null
    let recordedChunks  = []
    let actualChannels  = 1
    let actualBitrate   = BITRATE_MONO
    let cancelCountdown = null

    // ── Mic acquisition ──────────────────────────────────────────────────────

    async function acquireStream() {
      const constraints = studioMode ? STUDIO_CONSTRAINTS : DEFAULT_CONSTRAINTS
      micStream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
      const settings = micStream.getAudioTracks()[0]?.getSettings() ?? {}
      actualChannels = settings.channelCount ?? 1
      actualBitrate  = actualChannels >= 2 ? BITRATE_STEREO : BITRATE_MONO
      document.getElementById('settings-info').textContent =
        `${actualChannels === 1 ? 'Mono' : 'Stereo'} · ${actualBitrate / 1000} kbps · ` +
        `browser DSP ${studioMode ? 'off' : 'on'}`
      startVU(micStream)
    }

    function releaseStream() {
      micStream?.getTracks().forEach(t => t.stop())
      micStream = null
    }

    // ── VU meter ─────────────────────────────────────────────────────────────

    let vuAudioCtx = null
    let vuRaf      = null

    function startVU(stream) {
      vuAudioCtx = new AudioContext()
      const src      = vuAudioCtx.createMediaStreamSource(stream)
      const analyser = vuAudioCtx.createAnalyser()
      analyser.fftSize = 1024
      src.connect(analyser)
      const buf    = new Float32Array(analyser.fftSize)
      const vuBar  = document.getElementById('vu-bar')
      const clipLbl = document.getElementById('clip-label')
      function tick() {
        analyser.getFloatTimeDomainData(buf)
        let peak = 0
        for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a }
        const db       = peak > 0 ? 20 * Math.log10(peak) : -Infinity
        const pct      = Math.max(0, Math.min(100, (db + 60) / 60 * 100))
        const clipping = db >= -1
        vuBar.style.width = pct + '%'
        vuBar.className = `h-full rounded-full ${clipping ? 'bg-red-500' : 'bg-green-500'}`
        clipLbl.classList.toggle('hidden', !clipping)
        vuRaf = requestAnimationFrame(tick)
      }
      vuRaf = requestAnimationFrame(tick)
    }

    function stopVU() {
      cancelAnimationFrame(vuRaf)
      vuRaf = null
      vuAudioCtx?.close()
      vuAudioCtx = null
      document.getElementById('vu-bar').style.width = '0%'
      document.getElementById('clip-label').classList.add('hidden')
    }

    // ── Countdown ────────────────────────────────────────────────────────────

    function runCountdown(onDone) {
      const display = document.getElementById('countdown-display')
      let remaining = 3
      display.textContent = remaining
      const id = setInterval(() => {
        remaining -= 1
        if (remaining <= 0) {
          clearInterval(id)
          display.textContent = ''
          onDone()
        } else {
          display.textContent = remaining
        }
      }, 1000)
      return () => { clearInterval(id); display.textContent = '' }
    }

    // ── Record button ────────────────────────────────────────────────────────

    document.getElementById('btn-record').addEventListener('click', async () => {
      try {
        setPhase('countdown')
        await acquireStream()
        cancelCountdown = runCountdown(() => {
          cancelCountdown = null
          startRecording()
        })
      } catch (err) {
        stopVU()
        releaseStream()
        setPhase('idle')
        alert(`Mic error: ${err.message}`)
      }
    })

    // Stub — fully implemented in Task 4
    function startRecording() {
      setPhase('recording')
    }
```

- [ ] **Step 2: Wire the Stop button for Task 3 scope**

After the Record button section, add:

```js
    // ── Stop button ──────────────────────────────────────────────────────────

    document.getElementById('btn-stop').addEventListener('click', () => {
      if (cancelCountdown) {
        cancelCountdown()
        cancelCountdown = null
        stopVU()
        releaseStream()
        setPhase('idle')
        return
      }
      stopRecording()
    })

    // Stub — fully implemented in Task 4
    function stopRecording() {
      stopVU()
      releaseStream()
      setPhase('idle')
    }
```

- [ ] **Step 3: Verify in browser**

Refresh. Click ● Record, grant mic permission.

Verify:
- Mic permission prompt appears
- Settings info line appears: e.g. "Mono · 128 kbps · browser DSP on"
- VU bar animates green as you speak; turns red + CLIP when loud
- Countdown shows 3 → 2 → 1, then transitions to recording phase (timer slot visible)
- ⏹ Stop during countdown → returns to idle immediately, VU stops
- ⏹ Stop during recording → returns to idle (stub, no processing yet)
- Toggle Studio Mode before recording → settings line shows "browser DSP off"

- [ ] **Step 4: Commit**

```bash
git add experiments/audio-test.html
git commit -m "feat(test-app): mic acquisition, VU meter, countdown, and recording phase entry"
```

---

## Task 4: MediaRecorder + timer + pause/resume

Replaces the `startRecording` and `stopRecording` stubs with full implementations. Stop collects chunks and transitions to the processing phase (spinner shown; processing added in Tasks 6–7).

**Files:**
- Modify: `experiments/audio-test.html`

- [ ] **Step 1: Add timer helpers**

After the Stop button section, add:

```js
    // ── Timer ────────────────────────────────────────────────────────────────

    let timerInterval   = null
    let timerStartedAt  = null
    let pausedElapsedMs = 0

    function fmtTime(ms) {
      const s = Math.floor(ms / 1000)
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }

    function startTimer() {
      timerStartedAt = Date.now()
      timerInterval = setInterval(() => {
        const elapsed = pausedElapsedMs + (Date.now() - timerStartedAt)
        document.getElementById('timer-display').textContent = fmtTime(elapsed)
      }, 200)
    }

    function pauseTimer() {
      clearInterval(timerInterval)
      pausedElapsedMs += Date.now() - timerStartedAt
    }

    function resetTimer() {
      clearInterval(timerInterval)
      pausedElapsedMs = 0
      timerStartedAt  = null
      document.getElementById('timer-display').textContent = '0:00'
    }
```

- [ ] **Step 2: Replace the startRecording stub**

Find the comment `// Stub — fully implemented in Task 4` above `function startRecording()` and replace the entire stub with:

```js
    function startRecording() {
      recordedChunks = []
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']
        .find(t => MediaRecorder.isTypeSupported(t))
      const options = { audioBitsPerSecond: actualBitrate }
      if (mimeType) options.mimeType = mimeType
      mediaRecorder = new MediaRecorder(micStream, options)
      mediaRecorder.ondataavailable = e => { if (e.data?.size > 0) recordedChunks.push(e.data) }
      mediaRecorder.start(500)
      resetTimer()
      startTimer()
      setPhase('recording')
    }
```

- [ ] **Step 3: Replace the stopRecording stub**

Find the comment `// Stub — fully implemented in Task 4` above `function stopRecording()` and replace the entire stub with:

```js
    function stopRecording() {
      pauseTimer()
      stopVU()
      releaseWakeLock()
      setPhase('processing')
      mediaRecorder.onstop = async () => {
        releaseStream()
        await processAndShow()
      }
      mediaRecorder.stop()
    }

    // Stub — processAndShow fully implemented in Task 7
    async function processAndShow() {
      setPhase('done')
    }
```

- [ ] **Step 4: Wire pause and resume buttons**

After the timer section, add:

```js
    // ── Pause / Resume ───────────────────────────────────────────────────────

    document.getElementById('btn-pause').addEventListener('click', () => {
      if (mediaRecorder?.state === 'recording') {
        mediaRecorder.pause()
        pauseTimer()
        show('btn-resume')
        hide('btn-pause')
      }
    })

    document.getElementById('btn-resume').addEventListener('click', () => {
      if (mediaRecorder?.state === 'paused') {
        mediaRecorder.resume()
        startTimer()
        hide('btn-resume')
        show('btn-pause')
      }
    })
```

- [ ] **Step 5: Verify in browser**

Refresh. Record for 8–10 seconds.

Verify:
- Timer counts up during recording: 0:00, 0:01, 0:02…
- ⏸ Pause freezes the timer; ▶ Resume continues from the frozen value
- ⏹ Stop during recording → spinner appears briefly → empty comparison panel appears with "● Record again"
- ⏹ Stop during countdown → returns to idle immediately (unchanged)
- No console errors

- [ ] **Step 6: Commit**

```bash
git add experiments/audio-test.html
git commit -m "feat(test-app): MediaRecorder with chunk collection, timer, pause and resume"
```

---

## Task 5: WAV encoder

A shared `encodeWav(audioBuffer, gain, useDither)` used by both processing chains.

**Files:**
- Modify: `experiments/audio-test.html`

- [ ] **Step 1: Add the WAV encoder**

After the Pause/Resume section, add:

```js
    // ── WAV encoder ──────────────────────────────────────────────────────────

    function encodeWav(audioBuffer, gain, useDither = false) {
      const nc  = audioBuffer.numberOfChannels
      const sr  = audioBuffer.sampleRate
      const ns  = audioBuffer.length
      const dataSize = ns * nc * 2
      const buf  = new ArrayBuffer(44 + dataSize)
      const view = new DataView(buf)

      const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
      str(0,'RIFF'); view.setUint32(4, 36 + dataSize, true); str(8,'WAVE')
      str(12,'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
      view.setUint16(22, nc, true); view.setUint32(24, sr, true)
      view.setUint32(28, sr * nc * 2, true); view.setUint16(32, nc * 2, true)
      view.setUint16(34, 16, true); str(36,'data'); view.setUint32(40, dataSize, true)

      let offset = 44
      for (let s = 0; s < ns; s++) {
        for (let c = 0; c < nc; c++) {
          const dither = useDither ? (Math.random() + Math.random() - 1) / 32768 : 0
          const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[s] * gain + dither))
          view.setInt16(offset, Math.round(sample * 32767), true)
          offset += 2
        }
      }
      return buf
    }
```

- [ ] **Step 2: Verify**

Refresh the page. Check browser console: no errors.

- [ ] **Step 3: Commit**

```bash
git add experiments/audio-test.html
git commit -m "feat(test-app): shared WAV encoder with interleaved 16-bit PCM and optional TPDF dither"
```

---

## Task 6: Both processing chains + LUFS utilities

Adds `processOld`, the LUFS utilities, and `processNew` — all the audio DSP logic.

**Files:**
- Modify: `experiments/audio-test.html`

- [ ] **Step 1: Add processOld**

After the WAV encoder section, add:

```js
    // ── processOld — current app chain ───────────────────────────────────────
    // Replicates exactly what the songbook app does today.
    // HPF 80Hz → DynamicsCompressor (4:1, 5ms attack) → peak-norm to 0.9

    async function processOld(rawBuffer) {
      const audioCtx = new AudioContext()
      const decoded  = await audioCtx.decodeAudioData(rawBuffer.slice(0))
      await audioCtx.close()

      const offline = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate)
      const src = offline.createBufferSource()
      src.buffer = decoded

      const hpf = offline.createBiquadFilter()
      hpf.type = 'highpass'
      hpf.frequency.value = 80

      const comp = offline.createDynamicsCompressor()
      comp.threshold.value = -24
      comp.knee.value      = 10
      comp.ratio.value     = 4
      comp.attack.value    = 0.005
      comp.release.value   = 0.15

      src.connect(hpf); hpf.connect(comp); comp.connect(offline.destination)
      src.start()
      const processed = await offline.startRendering()

      let peak = 0
      for (let c = 0; c < processed.numberOfChannels; c++) {
        const data = processed.getChannelData(c)
        for (let s = 0; s < processed.length; s++) { const a = Math.abs(data[s]); if (a > peak) peak = a }
      }
      const gain = peak > 0.001 ? 0.9 / peak : 1

      return {
        wavBuffer: encodeWav(processed, gain, false),
        stats: 'Peak-norm: 0.90\n4:1 · 5ms attack · 150ms release',
      }
    }
```

Note: `rawBuffer.slice(0)` copies the `ArrayBuffer` so `decodeAudioData` can consume it without affecting `processNew`.

- [ ] **Step 2: Add LUFS utilities**

After `processOld`, add:

```js
    // ── LUFS measurement (BS.1770-4) ─────────────────────────────────────────
    // K-weighting = high-shelf pre-filter + high-pass RLB, two-stage IIR.
    // 48 kHz reference coefficients from ITU-R BS.1770-4.
    // Deviation < 0.5 LUFS at 44.1 kHz — acceptable here.

    const KW_HS_B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    const KW_HS_A = [1.0, -1.69065929318241, 0.73248077421585]
    const KW_HP_B = [1.0, -2.0, 1.0]
    const KW_HP_A = [1.0, -1.99004745483398, 0.99007225036603]

    function applyIIR(input, b, a) {
      const out = new Float32Array(input.length)
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0
      for (let i = 0; i < input.length; i++) {
        const x0 = input[i]
        const y0 = b[0]*x0 + b[1]*x1 + b[2]*x2 - a[1]*y1 - a[2]*y2
        out[i] = y0; x2 = x1; x1 = x0; y2 = y1; y1 = y0
      }
      return out
    }

    function kWeight(samples) {
      return applyIIR(applyIIR(samples, KW_HS_B, KW_HS_A), KW_HP_B, KW_HP_A)
    }

    function measureLUFS(audioBuffer) {
      const { sampleRate: sr, numberOfChannels: nc, length } = audioBuffer
      const weighted = Array.from({ length: nc }, (_, c) => kWeight(audioBuffer.getChannelData(c)))

      const blockSamples = Math.round(sr * 0.4)
      const stepSamples  = Math.round(sr * 0.1)
      const numBlocks    = Math.max(0, Math.floor((length - blockSamples) / stepSamples) + 1)
      if (numBlocks === 0) return -70

      const powers = []
      for (let i = 0; i < numBlocks; i++) {
        const start = i * stepSamples
        let sum = 0
        for (let c = 0; c < nc; c++) {
          const ch = weighted[c]
          for (let s = start; s < start + blockSamples; s++) sum += ch[s] * ch[s]
        }
        powers.push(sum / (blockSamples * nc))
      }

      const absGate = Math.pow(10, (-70 + 0.691) / 10)
      const pass1 = powers.filter(p => p >= absGate)
      if (!pass1.length) return -70

      const ungated = -0.691 + 10 * Math.log10(pass1.reduce((a, b) => a + b, 0) / pass1.length)
      const relGate = Math.pow(10, (ungated - 10 + 0.691) / 10)
      const pass2 = pass1.filter(p => p >= relGate)
      if (!pass2.length) return -70

      return -0.691 + 10 * Math.log10(pass2.reduce((a, b) => a + b, 0) / pass2.length)
    }
```

- [ ] **Step 3: Add processNew**

After the LUFS utilities, add:

```js
    // ── processNew — improved chain ───────────────────────────────────────────
    // HPF 80Hz → DynamicsCompressor (2.5:1, 20ms attack) → +4dB makeup gain
    // → LUFS-norm to −14 LUFS → true-peak ceiling −1 dBFS → TPDF dither

    const TARGET_LUFS      = -14
    const TRUE_PEAK_CEILING = 0.891  // −1 dBFS

    async function processNew(rawBuffer) {
      const audioCtx = new AudioContext()
      const decoded  = await audioCtx.decodeAudioData(rawBuffer.slice(0))
      await audioCtx.close()

      const offline = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate)
      const src = offline.createBufferSource()
      src.buffer = decoded

      const hpf = offline.createBiquadFilter()
      hpf.type = 'highpass'
      hpf.frequency.value = 80

      const comp = offline.createDynamicsCompressor()
      comp.threshold.value = -24
      comp.knee.value      = 10
      comp.ratio.value     = 2.5
      comp.attack.value    = 0.020
      comp.release.value   = 0.100

      const makeup = offline.createGain()
      makeup.gain.value = 1.585  // +4 dB

      src.connect(hpf); hpf.connect(comp); comp.connect(makeup); makeup.connect(offline.destination)
      src.start()
      const processed = await offline.startRendering()

      const measuredLUFS = measureLUFS(processed)
      let gain = (isFinite(measuredLUFS) && measuredLUFS > -70)
        ? Math.pow(10, (TARGET_LUFS - measuredLUFS) / 20)
        : 1

      let peak = 0
      for (let c = 0; c < processed.numberOfChannels; c++) {
        const data = processed.getChannelData(c)
        for (let s = 0; s < processed.length; s++) { const a = Math.abs(data[s]); if (a > peak) peak = a }
      }
      if (peak * gain > TRUE_PEAK_CEILING) gain = TRUE_PEAK_CEILING / peak

      const lufsStr = (isFinite(measuredLUFS) && measuredLUFS > -70)
        ? measuredLUFS.toFixed(1)
        : '< −70'

      return {
        wavBuffer: encodeWav(processed, gain, true),
        stats: `LUFS: ${lufsStr} → ${TARGET_LUFS}\n2.5:1 · 20ms attack · 100ms release · +4dB makeup`,
      }
    }
```

- [ ] **Step 4: Verify**

Refresh the page. Check browser console: no errors. (Processing is not yet called — wired in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add experiments/audio-test.html
git commit -m "feat(test-app): processOld, BS.1770-4 LUFS measurement, and processNew chain"
```

---

## Task 7: Comparison UI + download + Record again + wake lock

Replaces the `processAndShow` stub with the real implementation. Wires download buttons. Wires Record again. Adds screen wake lock.

**Files:**
- Modify: `experiments/audio-test.html`

- [ ] **Step 1: Add wake lock helpers**

After the processNew section, add:

```js
    // ── Wake lock ────────────────────────────────────────────────────────────

    let wakeLock = null

    async function acquireWakeLock() {
      if (!('wakeLock' in navigator)) return
      try { wakeLock = await navigator.wakeLock.request('screen') } catch {}
    }

    function releaseWakeLock() {
      wakeLock?.release().catch(() => {})
      wakeLock = null
    }
```

- [ ] **Step 2: Call acquireWakeLock from startRecording**

In the `startRecording` function (Task 4), add one line at the very end of the function body (after `setPhase('recording')`):

```js
      acquireWakeLock()
```

- [ ] **Step 3: Replace the processAndShow stub**

Find the comment `// Stub — processAndShow fully implemented in Task 7` and replace the entire stub function with:

```js
    async function processAndShow() {
      const mimeType  = recordedChunks[0]?.type ?? 'audio/webm'
      const rawBuffer = await new Blob(recordedChunks, { type: mimeType }).arrayBuffer()

      const [oldRes, newRes] = await Promise.allSettled([
        processOld(rawBuffer),
        processNew(rawBuffer),
      ])

      function populatePlayer(res, playerId, statsId, errorId, dlBtnId, filename) {
        if (res.status === 'rejected') {
          document.getElementById(errorId).classList.remove('hidden')
          return
        }
        const { wavBuffer, stats } = res.value
        const url    = URL.createObjectURL(new Blob([wavBuffer], { type: 'audio/wav' }))
        const player = document.getElementById(playerId)
        player.src   = url
        player.classList.remove('hidden')
        document.getElementById(statsId).textContent = stats
        const dlBtn  = document.getElementById(dlBtnId)
        dlBtn.classList.remove('hidden')
        dlBtn.onclick = () => {
          const a = Object.assign(document.createElement('a'), { href: url, download: filename })
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
        }
      }

      populatePlayer(oldRes, 'old-player', 'old-stats', 'old-error', 'btn-dl-old', 'recording-v1-current.wav')
      populatePlayer(newRes, 'new-player', 'new-stats', 'new-error', 'btn-dl-new', 'recording-v2-new.wav')

      setPhase('done')
    }
```

- [ ] **Step 4: Wire Record again button**

After the wake lock section, add:

```js
    // ── Record again ─────────────────────────────────────────────────────────

    document.getElementById('btn-again').addEventListener('click', () => {
      for (const id of ['old-player', 'new-player']) {
        const el = document.getElementById(id)
        if (el.src) URL.revokeObjectURL(el.src)
        el.src = ''
        el.classList.add('hidden')
      }
      for (const id of ['old-stats','new-stats']) document.getElementById(id).textContent = ''
      for (const id of ['old-error','new-error','btn-dl-old','btn-dl-new']) {
        document.getElementById(id).classList.add('hidden')
      }
      resetTimer()
      setPhase('idle')
    })
```

- [ ] **Step 5: Full end-to-end verify**

Refresh. Complete a full recording flow:

1. Click ● Record → grant permission → watch countdown (3 → 2 → 1) → VU meter live during countdown
2. Sing or speak for 10–15 seconds — try singing loudly to see CLIP warning
3. Try ⏸ Pause → ▶ Resume — timer freezes and resumes correctly
4. Click ⏹ Stop → spinner appears → both players appear
5. **Current (v1)** player works; **New (v2)** player works
6. Stats under each player show:
   - v1: `Peak-norm: 0.90 / 4:1 · 5ms attack · 150ms release`
   - v2: `LUFS: −xx.x → −14 / 2.5:1 · 20ms attack · 100ms release · +4dB makeup`
7. Download both WAV files — filenames are `recording-v1-current.wav` and `recording-v2-new.wav`
8. Click ● Record again → clean reset, both players gone, back to idle
9. On a phone: screen stays on during recording (wake lock)
10. ⏹ Stop during countdown → returns to idle, no errors

- [ ] **Step 6: Commit**

```bash
git add experiments/audio-test.html
git commit -m "feat(test-app): comparison UI, download buttons, Record again, and wake lock"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Single HTML file at `experiments/audio-test.html` | Task 1 |
| Comment at top with run instructions | Task 1 |
| Tailwind CDN Play script | Task 1 |
| `playsInline` on both `<audio>` elements | Task 1 (in HTML) |
| Phase state machine (idle/countdown/recording/processing/done) | Task 1 |
| Studio Mode toggle with visual feedback | Task 2 |
| `getUserMedia` with Studio Mode / default constraints | Task 3 |
| Settings info from `track.getSettings()` | Task 3 |
| Adaptive bitrate (128k mono / 192k stereo) | Task 3 |
| Live VU meter | Task 3 |
| Clipping detection at −1 dBFS | Task 3 |
| 3-second countdown | Task 3 |
| Stop during countdown returns to idle | Task 3 |
| MediaRecorder with 500ms timeslice | Task 4 |
| Timer counting up | Task 4 |
| Pause / Resume | Task 4 |
| `encodeWav` with TPDF dither flag | Task 5 |
| processOld: HPF → 4:1 compressor → peak-norm 0.9 | Task 6 |
| BS.1770-4 K-weighting IIR filter | Task 6 |
| Gated integrated loudness (absolute + relative gate) | Task 6 |
| processNew: HPF → 2.5:1 compressor → +4dB makeup → LUFS → true-peak → dither | Task 6 |
| Both chains receive same `ArrayBuffer` via `.slice(0)` | Task 6 |
| Two players populated after `Promise.allSettled` | Task 7 |
| Stats lines showing measured LUFS and chain params | Task 7 |
| Error handling per player if chain throws | Task 7 (`populatePlayer` checks `res.status`) |
| Download buttons with correct filenames | Task 7 |
| Record again resets all state cleanly | Task 7 |
| Object URL revocation on reset | Task 7 |
| Screen wake lock | Task 7 |
| Wake lock released on stop | Task 4 (`releaseWakeLock()` in `stopRecording`) |

### Placeholder scan

No TBD, TODO, or vague steps found. All code is complete.

### Type consistency

- `encodeWav(audioBuffer, gain, useDither)` — defined Task 5, called in Task 6 with `false` (processOld) and `true` (processNew) ✓
- `measureLUFS(audioBuffer)` — defined Task 6, called in Task 6 (processNew) ✓
- `startVU(stream)` / `stopVU()` — defined Task 3, called in Task 3 (acquireStream + stop handler) ✓
- `processOld(rawBuffer)` / `processNew(rawBuffer)` — defined Task 6, called in Task 7 (processAndShow) ✓
- `releaseWakeLock()` — defined Task 7, referenced in `stopRecording` Task 4 stub and Task 7 wiring ✓
- `startRecording` stub (Task 3) → replaced Task 4: no name collision, same function name ✓
- `stopRecording` stub (Task 3) → replaced Task 4: same ✓
- `processAndShow` stub (Task 4) → replaced Task 7: same ✓
- `cancelCountdown` — declared Task 3, set/cleared Task 3, read in stop handler Task 3 ✓
