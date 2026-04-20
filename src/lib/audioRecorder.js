const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

const BITRATE = 128_000
const TIMESLICE_MS = 500

export class AudioRecorder {
  static detectMimeType() {
    return MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) ?? null
  }

  constructor({ onChunk } = {}) {
    this._onChunk = onChunk ?? null
    this._mediaRecorder = null
    this._stream = null
    this._chunks = []
    this.state = 'inactive'
    this.mimeType = null
  }

  async start() {
    const mimeType = AudioRecorder.detectMimeType()
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    } catch (err) {
      this.state = 'inactive'
      throw err
    }

    this._stream = stream
    this._chunks = []
    this.mimeType = mimeType

    const options = { audioBitsPerSecond: BITRATE }
    if (mimeType) options.mimeType = mimeType

    const mr = new MediaRecorder(stream, options)
    this._mediaRecorder = mr
    this.mimeType = mr.mimeType || mimeType

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._chunks.push(e.data)
        if (this._onChunk) this._onChunk(e.data)
      }
    }

    mr.start(TIMESLICE_MS)
    this.state = 'recording'
  }

  pause() {
    if (this._mediaRecorder?.state === 'recording') {
      this._mediaRecorder.pause()
      this.state = 'paused'
    }
  }

  resume() {
    if (this._mediaRecorder?.state === 'paused') {
      this._mediaRecorder.resume()
      this.state = 'recording'
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this._mediaRecorder || this._mediaRecorder.state === 'inactive') {
        resolve([])
        return
      }
      this._mediaRecorder.onstop = () => {
        this._stream?.getTracks().forEach(t => t.stop())
        this.state = 'inactive'
        resolve([...this._chunks])
      }
      this._mediaRecorder.stop()
    })
  }
}
