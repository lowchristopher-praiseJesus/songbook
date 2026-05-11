# Recording Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live pulsing recording indicator (status + elapsed time) in the top bar next to the app name, and fix the silent data loss that occurs when a user changes songs during an active recording.

**Architecture:** A new minimal Zustand store (`recordingStore`) bridges recording state from `SongHeader` (deep in the tree) up to `App.jsx` (top bar). `useRecording` syncs to it via an effect and properly stops the recorder on unmount. A small `RecordingIndicator` component reads from the store and renders the indicator.

**Tech Stack:** React 18, Zustand, Vitest + @testing-library/react, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `src/store/recordingStore.js` | **Create** — minimal Zustand store: `{ status, elapsedMs, setRecordingState }` |
| `src/store/__tests__/recordingStore.test.js` | **Create** — unit tests for the store |
| `src/components/Recorder/RecordingTimer.jsx` | **Modify** — export `formatElapsed` so it can be reused |
| `src/hooks/useRecording.js` | **Modify** — add `statusRef`, store sync effect, unmount cleanup |
| `src/components/Recorder/RecordingIndicator.jsx` | **Create** — reads from store, renders the top bar indicator |
| `src/components/Recorder/__tests__/RecordingIndicator.test.jsx` | **Create** — unit tests for the indicator |
| `src/hooks/__tests__/useRecording.test.js` | **Modify** — add store reset in `beforeEach`, two new tests |
| `src/App.jsx` | **Modify** — render `<RecordingIndicator />` in the header |

---

## Task 1: Create `recordingStore.js`

**Files:**
- Create: `src/store/recordingStore.js`
- Create: `src/store/__tests__/recordingStore.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/store/__tests__/recordingStore.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useRecordingStore } from '../recordingStore'

beforeEach(() => {
  useRecordingStore.setState({ status: 'idle', elapsedMs: 0 })
})

describe('recordingStore', () => {
  it('initializes with idle status', () => {
    expect(useRecordingStore.getState().status).toBe('idle')
  })

  it('initializes with zero elapsedMs', () => {
    expect(useRecordingStore.getState().elapsedMs).toBe(0)
  })

  it('setRecordingState updates status and elapsedMs', () => {
    useRecordingStore.getState().setRecordingState('recording', 5000)
    expect(useRecordingStore.getState().status).toBe('recording')
    expect(useRecordingStore.getState().elapsedMs).toBe(5000)
  })

  it('setRecordingState can reset to idle', () => {
    useRecordingStore.getState().setRecordingState('recording', 5000)
    useRecordingStore.getState().setRecordingState('idle', 0)
    expect(useRecordingStore.getState().status).toBe('idle')
    expect(useRecordingStore.getState().elapsedMs).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- --reporter=verbose src/store/__tests__/recordingStore.test.js
```

Expected: FAIL — `Cannot find module '../recordingStore'`

- [ ] **Step 3: Implement `recordingStore.js`**

Create `src/store/recordingStore.js`:

```js
import { create } from 'zustand'

export const useRecordingStore = create((set) => ({
  status: 'idle',
  elapsedMs: 0,
  setRecordingState: (status, elapsedMs) => set({ status, elapsedMs }),
}))
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- --reporter=verbose src/store/__tests__/recordingStore.test.js
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/recordingStore.js src/store/__tests__/recordingStore.test.js
git commit -m "feat: add recordingStore for global recording state"
```

---

## Task 2: Export `formatElapsed` from `RecordingTimer.jsx`

**Files:**
- Modify: `src/components/Recorder/RecordingTimer.jsx`

- [ ] **Step 1: Export `formatElapsed`**

In `src/components/Recorder/RecordingTimer.jsx`, change the function declaration from:

```js
function formatElapsed(ms) {
```

to:

```js
export function formatElapsed(ms) {
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
npm test -- --reporter=verbose src/components/Recorder/__tests__/RecordingTimer.test.jsx
```

Expected: all 6 tests PASS (no behaviour changed, only visibility)

- [ ] **Step 3: Commit**

```bash
git add src/components/Recorder/RecordingTimer.jsx
git commit -m "feat: export formatElapsed from RecordingTimer"
```

---

## Task 3: Add store sync and unmount cleanup to `useRecording`

**Files:**
- Modify: `src/hooks/useRecording.js`
- Modify: `src/hooks/__tests__/useRecording.test.js`

- [ ] **Step 1: Write the failing tests**

In `src/hooks/__tests__/useRecording.test.js`, add the following imports and changes:

At the top, add the store import after the existing imports:

```js
import { useRecordingStore } from '../../store/recordingStore'
```

Inside the existing `beforeEach`, add a store reset after `vi.useFakeTimers()`:

```js
beforeEach(() => {
  vi.useFakeTimers()
  useRecordingStore.setState({ status: 'idle', elapsedMs: 0 })
  hook = renderHook(() => useRecording({ songId: 'song-abc', songTitle: 'Amazing Grace' }))
})
```

Add these two tests inside `describe('useRecording', () => { ... })` after the existing tests:

```js
it('syncs status to recordingStore when recording starts', async () => {
  expect(useRecordingStore.getState().status).toBe('idle')
  await act(async () => { await hook.result.current.startRecording() })
  expect(useRecordingStore.getState().status).toBe('recording')
})

it('stops recorder and resets store when unmounted during recording', async () => {
  const { AudioRecorder } = await import('../../lib/audioRecorder')
  const mockStop = vi.fn().mockResolvedValue([])
  AudioRecorder.mockImplementationOnce(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: mockStop,
    mimeType: 'audio/webm',
    channels: 1,
    state: 'inactive',
  }))
  const cleanupHook = renderHook(() => useRecording({ songId: 'song-abc', songTitle: 'Test' }))
  await act(async () => { await cleanupHook.result.current.startRecording() })
  expect(cleanupHook.result.current.status).toBe('recording')
  cleanupHook.unmount()
  expect(mockStop).toHaveBeenCalled()
  expect(useRecordingStore.getState().status).toBe('idle')
})
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
npm test -- --reporter=verbose src/hooks/__tests__/useRecording.test.js
```

Expected: existing tests PASS, the two new tests FAIL — `recordingStore` not yet wired to `useRecording`

- [ ] **Step 3: Implement the changes in `useRecording.js`**

In `src/hooks/useRecording.js`, add the store import after the existing imports:

```js
import { useRecordingStore } from '../store/recordingStore'
```

Add `statusRef` after the existing refs (after `const pausedElapsedRef = useRef(0)`):

```js
const statusRef = useRef('idle')
```

Add two new effects after the existing `useEffect` for `refreshRecordingCount` (around line 75). Insert before the `handleRecordingsChange` function:

```js
useEffect(() => {
  statusRef.current = status
  useRecordingStore.getState().setRecordingState(status, elapsedMs)
}, [status, elapsedMs])

useEffect(() => {
  return () => {
    if (statusRef.current === 'recording' || statusRef.current === 'paused') {
      recorderRef.current?.stop()
      clearInterval(timerRef.current)
    }
    useRecordingStore.getState().setRecordingState('idle', 0)
  }
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Run all `useRecording` tests to confirm they pass**

```bash
npm test -- --reporter=verbose src/hooks/__tests__/useRecording.test.js
```

Expected: all tests PASS including the two new ones

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRecording.js src/hooks/__tests__/useRecording.test.js
git commit -m "feat: sync recording state to store and stop recorder on unmount"
```

---

## Task 4: Create `RecordingIndicator` component

**Files:**
- Create: `src/components/Recorder/RecordingIndicator.jsx`
- Create: `src/components/Recorder/__tests__/RecordingIndicator.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Recorder/__tests__/RecordingIndicator.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecordingIndicator } from '../RecordingIndicator'
import { useRecordingStore } from '../../../store/recordingStore'

beforeEach(() => {
  useRecordingStore.setState({ status: 'idle', elapsedMs: 0 })
})

describe('RecordingIndicator', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<RecordingIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when status is requesting', () => {
    useRecordingStore.setState({ status: 'requesting', elapsedMs: 0 })
    const { container } = render(<RecordingIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('shows elapsed time when recording', () => {
    useRecordingStore.setState({ status: 'recording', elapsedMs: 65000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('shows pause icon when paused', () => {
    useRecordingStore.setState({ status: 'paused', elapsedMs: 30000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('⏸')).toBeInTheDocument()
    expect(screen.getByText('0:30')).toBeInTheDocument()
  })

  it('elapsed time is red when recording', () => {
    useRecordingStore.setState({ status: 'recording', elapsedMs: 5000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('0:05').className).toMatch(/text-red/)
  })

  it('elapsed time is gray when paused', () => {
    useRecordingStore.setState({ status: 'paused', elapsedMs: 5000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('0:05').className).toMatch(/text-gray/)
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm test -- --reporter=verbose src/components/Recorder/__tests__/RecordingIndicator.test.jsx
```

Expected: FAIL — `Cannot find module '../RecordingIndicator'`

- [ ] **Step 3: Implement `RecordingIndicator.jsx`**

Create `src/components/Recorder/RecordingIndicator.jsx`:

```jsx
import { useRecordingStore } from '../../store/recordingStore'
import { formatElapsed } from './RecordingTimer'

export function RecordingIndicator() {
  const status = useRecordingStore(s => s.status)
  const elapsedMs = useRecordingStore(s => s.elapsedMs)

  if (status !== 'recording' && status !== 'paused') return null

  return (
    <span className="flex items-center gap-1.5 text-sm ml-2">
      {status === 'recording' ? (
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
      ) : (
        <span className="text-yellow-500" aria-hidden="true">⏸</span>
      )}
      <span
        className={`font-mono tabular-nums ${
          status === 'recording'
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {formatElapsed(elapsedMs)}
      </span>
    </span>
  )
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm test -- --reporter=verbose src/components/Recorder/__tests__/RecordingIndicator.test.jsx
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Recorder/RecordingIndicator.jsx src/components/Recorder/__tests__/RecordingIndicator.test.jsx
git commit -m "feat: add RecordingIndicator component for top bar"
```

---

## Task 5: Wire `RecordingIndicator` into the top bar

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the import and render the indicator**

In `src/App.jsx`, add the import after the existing imports (e.g. after the `BroadcastWaitingBanner` import):

```js
import { RecordingIndicator } from './components/Recorder/RecordingIndicator'
```

In the header JSX (around line 230), find the app name span:

```jsx
<span className="font-bold text-lg select-none">🎵 SongSheet</span>
```

Replace it with:

```jsx
<span className="font-bold text-lg select-none">🎵 SongSheet</span>
<RecordingIndicator />
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: show recording indicator in top bar"
```
