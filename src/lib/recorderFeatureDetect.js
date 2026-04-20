export function checkRecorderSupport() {
  if (!isSecureContext) {
    return { supported: false, reason: 'Requires a secure context (HTTPS or localhost).' }
  }
  if (typeof MediaRecorder === 'undefined') {
    return { supported: false, reason: 'MediaRecorder API is not available in this browser.' }
  }
  if (typeof navigator.storage?.getDirectory !== 'function') {
    return { supported: false, reason: 'OPFS (Origin Private File System) is not supported.' }
  }
  if (typeof Worker === 'undefined') {
    return { supported: false, reason: 'Web Worker API is not available in this browser.' }
  }
  return { supported: true }
}
