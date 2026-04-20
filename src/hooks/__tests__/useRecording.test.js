import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRecording } from '../useRecording'

vi.mock('../../lib/audioRecorder', () => ({
  AudioRecorder: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn().mockResolvedValue([new Blob(['audio'], { type: 'audio/webm' })]),
    mimeType: 'audio/webm',
    state: 'inactive',
  })),
}))

vi.mock('../../lib/opfsClient', () => ({
  OPFSClient: {
    create: vi.fn(() => ({
      send: vi.fn().mockResolvedValue({ ok: true }),
      sendTransfer: vi.fn().mockResolvedValue({ bytesWritten: 5, totalSize: 5 }),
      terminate: vi.fn(),
    })),
  },
}))

vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('test-recording-id') })

describe('useRecording', () => {
  let hook

  beforeEach(() => {
    vi.useFakeTimers()
    hook = renderHook(() => useRecording({ songId: 'song-abc', songTitle: 'Amazing Grace' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('starts in idle state', () => {
    expect(hook.result.current.status).toBe('idle')
  })

  it('elapsedMs is 0 initially', () => {
    expect(hook.result.current.elapsedMs).toBe(0)
  })

  it('startRecording() transitions to recording', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    expect(hook.result.current.status).toBe('recording')
  })

  it('timer increments every 200ms while recording', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    act(() => { vi.advanceTimersByTime(400) })
    expect(hook.result.current.elapsedMs).toBeGreaterThanOrEqual(400)
  })

  it('pauseRecording() transitions to paused', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    act(() => { hook.result.current.pauseRecording() })
    expect(hook.result.current.status).toBe('paused')
  })

  it('timer does not increment while paused', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { hook.result.current.pauseRecording() })
    const elapsed = hook.result.current.elapsedMs
    act(() => { vi.advanceTimersByTime(400) })
    expect(hook.result.current.elapsedMs).toBe(elapsed)
  })

  it('resumeRecording() transitions back to recording', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    act(() => { hook.result.current.pauseRecording() })
    act(() => { hook.result.current.resumeRecording() })
    expect(hook.result.current.status).toBe('recording')
  })

  it('stopRecording() transitions to naming', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    await act(async () => { await hook.result.current.stopRecording() })
    expect(hook.result.current.status).toBe('naming')
  })

  it('pendingName has default value after stopping', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    await act(async () => { await hook.result.current.stopRecording() })
    expect(hook.result.current.pendingName).toContain('Amazing Grace')
  })

  it('saveRecording() transitions back to idle', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    await act(async () => { await hook.result.current.stopRecording() })
    await act(async () => { await hook.result.current.saveRecording('My Name') })
    expect(hook.result.current.status).toBe('idle')
  })

  it('cancelNaming() transitions back to idle without saving', async () => {
    await act(async () => { await hook.result.current.startRecording() })
    await act(async () => { await hook.result.current.stopRecording() })
    act(() => { hook.result.current.cancelNaming() })
    expect(hook.result.current.status).toBe('idle')
  })

  it('error state is set when getUserMedia fails', async () => {
    const { AudioRecorder } = await import('../../lib/audioRecorder')
    AudioRecorder.mockImplementationOnce(() => ({
      start: vi.fn().mockRejectedValue(new Error('Permission denied')),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn().mockResolvedValue([]),
      mimeType: null,
      state: 'inactive',
    }))
    const errHook = renderHook(() => useRecording({ songId: 'song-abc', songTitle: 'Test' }))
    await act(async () => { await errHook.result.current.startRecording() })
    expect(errHook.result.current.status).toBe('error')
    expect(errHook.result.current.error).toContain('Permission denied')
  })
})
