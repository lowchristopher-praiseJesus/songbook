export async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  // High-pass filter at 80Hz to remove room rumble and handling noise
  const offlineCtx = new OfflineAudioContext(
    decoded.numberOfChannels,
    decoded.length,
    decoded.sampleRate
  )
  const source = offlineCtx.createBufferSource()
  source.buffer = decoded
  const filter = offlineCtx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 80
  source.connect(filter)
  filter.connect(offlineCtx.destination)
  source.start()
  const filtered = await offlineCtx.startRendering()

  const numChannels = filtered.numberOfChannels
  const sampleRate = filtered.sampleRate
  const numSamples = filtered.length
  const wavBuffer = new ArrayBuffer(44 + numSamples * numChannels * 2)
  const view = new DataView(wavBuffer)

  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  const writeUint32 = (offset, val) => view.setUint32(offset, val, true)
  const writeUint16 = (offset, val) => view.setUint16(offset, val, true)

  const dataSize = numSamples * numChannels * 2
  writeStr(0, 'RIFF'); writeUint32(4, 36 + dataSize); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); writeUint32(16, 16); writeUint16(20, 1)
  writeUint16(22, numChannels); writeUint32(24, sampleRate)
  writeUint32(28, sampleRate * numChannels * 2); writeUint16(32, numChannels * 2)
  writeUint16(34, 16); writeStr(36, 'data'); writeUint32(40, dataSize)

  let peak = 0
  for (let c = 0; c < numChannels; c++) {
    const data = filtered.getChannelData(c)
    for (let s = 0; s < numSamples; s++) {
      const abs = Math.abs(data[s])
      if (abs > peak) peak = abs
    }
  }
  const gain = peak > 0.001 ? 0.9 / peak : 1

  let offset = 44
  for (let s = 0; s < numSamples; s++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, filtered.getChannelData(c)[s] * gain))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return wavBuffer
}
