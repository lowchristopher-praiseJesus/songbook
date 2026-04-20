import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OPFSClient } from '../opfsClient'

function makeEchoWorker(transform = r => ({ requestId: r.requestId, ok: true, result: 'ok' })) {
  const listeners = []
  return {
    postMessage: vi.fn((msg) => {
      const response = transform(msg)
      setTimeout(() => listeners.forEach(fn => fn({ data: response })), 0)
    }),
    addEventListener: vi.fn((_, fn) => listeners.push(fn)),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  }
}

describe('OPFSClient', () => {
  let mockWorker, client

  beforeEach(() => {
    mockWorker = makeEchoWorker()
    client = new OPFSClient(mockWorker)
  })

  afterEach(() => { client.terminate() })

  it('sends a message to the worker with a requestId', async () => {
    await client.send('write-meta', { songId: 'abc', recordingId: '123', meta: {} })
    expect(mockWorker.postMessage).toHaveBeenCalledOnce()
    const msg = mockWorker.postMessage.mock.calls[0][0]
    expect(msg.type).toBe('write-meta')
    expect(msg.requestId).toBeTruthy()
    expect(msg.songId).toBe('abc')
  })

  it('resolves with the result from the worker', async () => {
    const result = await client.send('read-meta', { songId: 'abc', recordingId: '123' })
    expect(result).toBe('ok')
  })

  it('rejects when worker replies with ok: false', async () => {
    const errorWorker = makeEchoWorker(r => ({ requestId: r.requestId, ok: false, error: 'File not found' }))
    const errorClient = new OPFSClient(errorWorker)
    await expect(errorClient.send('read-meta', { songId: 'x', recordingId: 'y' }))
      .rejects.toThrow('File not found')
    errorClient.terminate()
  })

  it('multiple concurrent sends are resolved independently', async () => {
    const listeners = []
    const delayedWorker = {
      postMessage: vi.fn((msg) => {
        setTimeout(() => listeners.forEach(fn => fn({ data: { requestId: msg.requestId, ok: true, result: msg.type } })), 10)
      }),
      addEventListener: vi.fn((_, fn) => listeners.push(fn)),
      removeEventListener: vi.fn(),
      terminate: vi.fn(),
    }
    const cc = new OPFSClient(delayedWorker)
    const [r1, r2] = await Promise.all([cc.send('write-meta', {}), cc.send('read-meta', {})])
    expect(r1).toBe('write-meta')
    expect(r2).toBe('read-meta')
    cc.terminate()
  })

  it('sendTransfer passes transferable buffers', async () => {
    const buffer = new ArrayBuffer(8)
    await client.sendTransfer('write-chunk', { buffer }, [buffer])
    const msg = mockWorker.postMessage.mock.calls[0][0]
    expect(msg.buffer).toBe(buffer)
  })

  it('terminate() calls worker.terminate()', () => {
    client.terminate()
    expect(mockWorker.terminate).toHaveBeenCalledOnce()
  })
})
