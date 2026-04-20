import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkRecorderSupport } from '../recorderFeatureDetect'

afterEach(() => vi.unstubAllGlobals())

describe('checkRecorderSupport', () => {
  it('returns supported: true when all APIs are present', () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('Worker', function () {})
    const result = checkRecorderSupport()
    expect(result.supported).toBe(true)
  })

  it('returns supported: false when not in a secure context', () => {
    vi.stubGlobal('isSecureContext', false)
    const result = checkRecorderSupport()
    expect(result.supported).toBe(false)
    expect(result.reason).toMatch(/secure context/i)
  })

  it('returns supported: false when MediaRecorder is absent', () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('MediaRecorder', undefined)
    const result = checkRecorderSupport()
    expect(result.supported).toBe(false)
    expect(result.reason).toMatch(/mediarecorder/i)
  })

  it('returns supported: false when navigator.storage.getDirectory is absent', () => {
    vi.stubGlobal('isSecureContext', true)
    const origGetDirectory = navigator.storage.getDirectory
    navigator.storage.getDirectory = undefined
    const result = checkRecorderSupport()
    expect(result.supported).toBe(false)
    expect(result.reason).toMatch(/opfs/i)
    navigator.storage.getDirectory = origGetDirectory
  })

  it('returns supported: false when Worker is absent', () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('Worker', undefined)
    const result = checkRecorderSupport()
    expect(result.supported).toBe(false)
    expect(result.reason).toMatch(/web worker/i)
  })
})
