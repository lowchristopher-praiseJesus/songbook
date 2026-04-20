import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AudioRecorder } from '../audioRecorder'

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

describe('AudioRecorder instance', () => {
  let recorder

  beforeEach(() => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    })
    recorder = new AudioRecorder()
  })

  afterEach(async () => {
    if (recorder.state !== 'inactive') await recorder.stop()
  })

  it('initialises with state inactive', () => {
    expect(recorder.state).toBe('inactive')
  })

  it('start() calls getUserMedia with correct constraints', async () => {
    await recorder.start()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
  })

  it('start() sets state to recording', async () => {
    await recorder.start()
    expect(recorder.state).toBe('recording')
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

  it('stop() sets state back to inactive', async () => {
    await recorder.start()
    await recorder.stop()
    expect(recorder.state).toBe('inactive')
  })

  it('mimeType is set after start()', async () => {
    await recorder.start()
    expect(recorder.mimeType).toBeTruthy()
  })

  it('onChunk callback is called when data is available', async () => {
    const onChunk = vi.fn()
    recorder = new AudioRecorder({ onChunk })
    await recorder.start()
    await recorder.stop()
    expect(onChunk).toHaveBeenCalled()
  })

  it('stop() stops all tracks on the stream', async () => {
    const stopFn = vi.fn()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopFn }, { stop: stopFn }],
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
