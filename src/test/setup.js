import '@testing-library/jest-dom'

// jsdom localStorage mock
const store = {}
const localStorageMock = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value) },
  removeItem: (key) => { delete store[key] },
  clear: () => { for (const key in store) delete store[key] },
  key: (index) => Object.keys(store)[index] || null,
  get length() { return Object.keys(store).length },
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// jsdom does not implement File/Blob .text() or .arrayBuffer() — polyfill them
if (typeof File !== 'undefined' && !File.prototype.text) {
  File.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}
if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

// ─── MediaRecorder mock ──────────────────────────────────────────────────────
class MockMediaRecorder extends EventTarget {
  constructor(stream, options = {}) {
    super()
    this.stream = stream
    this.mimeType = options.mimeType ?? 'audio/webm'
    this.state = 'inactive'
    this.ondataavailable = null
    this.onstop = null
    this.onerror = null
  }
  start(timeslice) {
    this.state = 'recording'
    this._timeslice = timeslice
  }
  pause() { this.state = 'paused' }
  resume() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['audio'], { type: this.mimeType }) })
    }
    if (this.onstop) this.onstop()
  }
  static isTypeSupported(type) {
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].includes(type)
  }
}
if (typeof globalThis.MediaRecorder === 'undefined') {
  globalThis.MediaRecorder = MockMediaRecorder
}

// ─── getUserMedia mock ───────────────────────────────────────────────────────
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', { value: {}, writable: true })
}
if (!navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  })
}

// ─── OPFS mocks ───────────────────────────────────────────────────────────────
function makeSyncHandle(initialData = new Uint8Array()) {
  let data = initialData
  return {
    read: vi.fn((buf, opts) => {
      const view = new Uint8Array(buf)
      const offset = opts?.at ?? 0
      const slice = data.subarray(offset, offset + view.length)
      view.set(slice)
      return slice.length
    }),
    write: vi.fn((buf, opts) => {
      const view = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)
      const offset = opts?.at ?? 0
      const next = new Uint8Array(Math.max(data.length, offset + view.length))
      next.set(data)
      next.set(view, offset)
      data = next
      return view.length
    }),
    truncate: vi.fn((size) => { data = data.subarray(0, size) }),
    getSize: vi.fn(() => data.length),
    flush: vi.fn(),
    close: vi.fn(),
  }
}

function makeFileHandle(name = 'file', content = new Uint8Array()) {
  const syncHandle = makeSyncHandle(content)
  return {
    name,
    kind: 'file',
    createSyncAccessHandle: vi.fn().mockResolvedValue(syncHandle),
    getFile: vi.fn().mockResolvedValue(new File([content], name)),
    _syncHandle: syncHandle,
  }
}

function makeDirHandle(name = 'root') {
  const _entries = new Map()
  const handle = {
    name,
    kind: 'directory',
    _entries,
    getFileHandle: vi.fn(async (fname, opts) => {
      if (!_entries.has(fname)) {
        if (!opts?.create) throw new DOMException('Not found', 'NotFoundError')
        _entries.set(fname, makeFileHandle(fname))
      }
      return _entries.get(fname)
    }),
    getDirectoryHandle: vi.fn(async (dname, opts) => {
      if (!_entries.has(dname)) {
        if (!opts?.create) throw new DOMException('Not found', 'NotFoundError')
        _entries.set(dname, makeDirHandle(dname))
      }
      return _entries.get(dname)
    }),
    removeEntry: vi.fn(async (ename) => { _entries.delete(ename) }),
    values: vi.fn(function* () { yield* _entries.values() }),
    entries: vi.fn(function* () { yield* _entries.entries() }),
  }
  return handle
}

const mockOPFSRoot = makeDirHandle('root')
if (!navigator.storage) {
  Object.defineProperty(navigator, 'storage', { value: {}, writable: true })
}
navigator.storage.getDirectory = vi.fn().mockResolvedValue(mockOPFSRoot)

globalThis.__makeOPFSDirHandle = makeDirHandle
globalThis.__makeOPFSFileHandle = makeFileHandle
globalThis.__makeSyncHandle = makeSyncHandle
