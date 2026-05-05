export async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  const numChannels = decoded.numberOfChannels
  const sampleRate = decoded.sampleRate
  const numSamples = decoded.length
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

  let offset = 44
  for (let s = 0; s < numSamples; s++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, decoded.getChannelData(c)[s]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return wavBuffer
}
