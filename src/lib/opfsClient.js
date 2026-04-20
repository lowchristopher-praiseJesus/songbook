export class OPFSClient {
  constructor(worker) {
    this._worker = worker
    this._pending = new Map()

    worker.addEventListener('message', (e) => {
      const { requestId, ok, result, error } = e.data
      const pending = this._pending.get(requestId)
      if (!pending) return
      this._pending.delete(requestId)
      ok ? pending.resolve(result) : pending.reject(new Error(error))
    })
  }

  static create() {
    const worker = new Worker(
      new URL('../workers/storageWorker.js', import.meta.url),
      { type: 'module' }
    )
    return new OPFSClient(worker)
  }

  _nextId() {
    return crypto.randomUUID()
  }

  send(type, payload = {}) {
    const requestId = this._nextId()
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject })
      this._worker.postMessage({ type, requestId, ...payload })
    })
  }

  sendTransfer(type, payload = {}, transfer = []) {
    const requestId = this._nextId()
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject })
      this._worker.postMessage({ type, requestId, ...payload }, transfer)
    })
  }

  terminate() {
    this._worker.terminate()
  }
}
