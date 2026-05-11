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
