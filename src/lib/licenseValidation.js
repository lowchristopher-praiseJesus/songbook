import SparkMD5 from 'spark-md5'

const SECRET = 'songsheet-conductor-2026-v1'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const KEY_REGEX = /^SONGBOOK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

function charToBits(ch) {
  const i = ALPHABET.indexOf(ch)
  if (i === -1) throw new Error(`Invalid character: ${ch}`)
  return i
}

function bitsToChar(bits) {
  return ALPHABET[bits & 0x1f]
}

function decodePayload(chars) {
  if (chars.length !== 12) throw new Error('Payload must be 12 characters')
  const bits = new Array(60)
  for (let i = 0; i < 12; i++) {
    const v = charToBits(chars[i])
    for (let b = 0; b < 5; b++) {
      bits[i * 5 + b] = (v >> (4 - b)) & 1
    }
  }

  function readBits(start, count) {
    let val = 0
    for (let i = 0; i < count; i++) {
      val = (val << 1) | bits[start + i]
    }
    return val
  }

  return {
    version: readBits(0, 4),
    expiresAt: readBits(4, 31),
    licenseType: readBits(35, 4),
  }
}

function encodePayload({ version, expiresAt, licenseType, random }) {
  const bits = new Array(60).fill(0)

  function writeBits(start, count, value) {
    for (let i = count - 1; i >= 0; i--) {
      bits[start + i] = value & 1
      value >>= 1
    }
  }

  writeBits(0, 4, version)
  writeBits(4, 31, expiresAt)
  writeBits(35, 4, licenseType)
  writeBits(39, 21, random)

  let chars = ''
  for (let i = 0; i < 12; i++) {
    let v = 0
    for (let b = 0; b < 5; b++) {
      v = (v << 1) | bits[i * 5 + b]
    }
    chars += bitsToChar(v)
  }
  return chars
}

function computeChecksum(payload) {
  const hash = SparkMD5.hash(SECRET + payload)
  let bits = 0
  for (let i = 0; i < 5; i++) {
    bits = (bits << 4) | parseInt(hash[i], 16)
  }
  let checksum = ''
  for (let i = 0; i < 4; i++) {
    checksum += bitsToChar((bits >> (15 - i * 5)) & 0x1f)
  }
  return checksum
}

export function validateLicenseKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'No license key provided' }
  }

  const cleaned = key.trim().toUpperCase()

  if (!KEY_REGEX.test(cleaned)) {
    return { valid: false, error: 'Invalid license key format' }
  }

  const segments = cleaned.split('-')
  const payload = segments[1] + segments[2] + segments[3]
  const claimedChecksum = segments[4]

  const expectedChecksum = computeChecksum(payload)
  if (claimedChecksum !== expectedChecksum) {
    return { valid: false, error: 'Invalid license key' }
  }

  let payloadData
  try {
    payloadData = decodePayload(payload)
  } catch {
    return { valid: false, error: 'Invalid license key' }
  }

  if (payloadData.version > 1) {
    return { valid: false, error: 'Unsupported license version' }
  }

  return { valid: true, payload: payloadData }
}

export function isLicenseExpired(payload) {
  if (!payload || payload.expiresAt === 0) return false
  return Date.now() / 1000 > payload.expiresAt
}

export function getLicenseStatus(key) {
  if (!key) return 'missing'

  const result = validateLicenseKey(key)
  if (!result.valid) return 'invalid'

  if (isLicenseExpired(result.payload)) return 'expired'

  return 'valid'
}

// Exported for use by the key generator script
export { encodePayload, computeChecksum, ALPHABET, SECRET }
