const KEY_REGEX = /^SONGBOOK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

export function isValidKeyFormat(key) {
  if (!key || typeof key !== 'string') return false
  return KEY_REGEX.test(key.trim().toUpperCase())
}

// Returns 'missing' | 'invalid_format' | 'unchecked'
// 'unchecked' means format is valid but the server has not yet verified the checksum.
export function getLicenseStatus(key) {
  if (!key) return 'missing'
  if (!isValidKeyFormat(key)) return 'invalid_format'
  return 'unchecked'
}
