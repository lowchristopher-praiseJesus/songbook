import { describe, it, expect } from 'vitest'
import {
  validateLicenseKey,
  isLicenseExpired,
  getLicenseStatus,
  encodePayload,
  computeChecksum,
} from '../licenseValidation'

function makeKey({ expiresAt = 0, licenseType = 1 } = {}) {
  const random = (Math.random() * 0x1fffff) | 0
  const payload = encodePayload({ version: 0, expiresAt, licenseType, random })
  const checksum = computeChecksum(payload)
  return `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${checksum}`
}

describe('validateLicenseKey', () => {
  it('accepts a valid key with no expiry', () => {
    const key = makeKey()
    const result = validateLicenseKey(key)
    expect(result.valid).toBe(true)
    expect(result.payload.expiresAt).toBe(0)
    expect(result.payload.licenseType).toBe(1)
  })

  it('accepts a valid key with future expiry', () => {
    const future = Math.floor(Date.now() / 1000) + 86400 * 365
    const key = makeKey({ expiresAt: future })
    const result = validateLicenseKey(key)
    expect(result.valid).toBe(true)
    expect(result.payload.expiresAt).toBe(future)
  })

  it('rejects empty string', () => {
    const result = validateLicenseKey('')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects null/undefined', () => {
    expect(validateLicenseKey(null).valid).toBe(false)
    expect(validateLicenseKey(undefined).valid).toBe(false)
  })

  it('rejects wrong format', () => {
    expect(validateLicenseKey('BLAH').valid).toBe(false)
    expect(validateLicenseKey('SONGBOOK-AAAA-AAAA-AAAA').valid).toBe(false) // missing last segment
    expect(validateLicenseKey('SONGBOOK-AAAA-BBBB-CCCC-DDDD-EEEE').valid).toBe(false)
  })

  it('rejects bad checksum', () => {
    const key = makeKey()
    // Flip the last character to break checksum
    const chars = key.split('')
    const lastChar = chars[chars.length - 1]
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const different = alphabet[(alphabet.indexOf(lastChar) + 1) % alphabet.length]
    chars[chars.length - 1] = different
    const badKey = chars.join('')
    const result = validateLicenseKey(badKey)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  it('rejects tampered payload segment', () => {
    const key = makeKey()
    const segments = key.split('-')
    // Tamper with expiry by changing a character in second segment
    const seg2Chars = segments[2].split('')
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const orig = seg2Chars[0]
    const different = alphabet[(alphabet.indexOf(orig) + 1) % alphabet.length]
    seg2Chars[0] = different
    segments[2] = seg2Chars.join('')
    const badKey = segments.join('-')
    expect(validateLicenseKey(badKey).valid).toBe(false)
  })

  it('handles lowercase input', () => {
    const key = makeKey().toLowerCase()
    expect(validateLicenseKey(key).valid).toBe(true)
  })

  it('handles input with extra whitespace', () => {
    const key = makeKey()
    expect(validateLicenseKey(`  ${key}  `).valid).toBe(true)
  })

  it('rejects key with wrong prefix', () => {
    const key = makeKey().replace('SONGBOOK', 'XONGBOOK')
    expect(validateLicenseKey(key).valid).toBe(false)
  })
})

describe('isLicenseExpired', () => {
  it('returns false for expiresAt=0 (no expiry)', () => {
    expect(isLicenseExpired({ expiresAt: 0 })).toBe(false)
  })

  it('returns false for future timestamp', () => {
    const future = Math.floor(Date.now() / 1000) + 86400
    expect(isLicenseExpired({ expiresAt: future })).toBe(false)
  })

  it('returns true for past timestamp', () => {
    const past = Math.floor(Date.now() / 1000) - 86400
    expect(isLicenseExpired({ expiresAt: past })).toBe(true)
  })

  it('returns false for null payload', () => {
    expect(isLicenseExpired(null)).toBe(false)
  })
})

describe('getLicenseStatus', () => {
  it('returns missing for empty key', () => {
    expect(getLicenseStatus('')).toBe('missing')
    expect(getLicenseStatus(null)).toBe('missing')
  })

  it('returns invalid for bad key', () => {
    expect(getLicenseStatus('SONGBOOK-AAAA-AAAA-AAAA')).toBe('invalid')
  })

  it('returns valid for good key with no expiry', () => {
    const key = makeKey()
    expect(getLicenseStatus(key)).toBe('valid')
  })

  it('returns expired for valid key with past expiry', () => {
    const past = Math.floor(Date.now() / 1000) - 86400
    const key = makeKey({ expiresAt: past })
    expect(getLicenseStatus(key)).toBe('expired')
  })

  it('returns valid for key with future expiry', () => {
    const future = Math.floor(Date.now() / 1000) + 86400 * 365
    const key = makeKey({ expiresAt: future })
    expect(getLicenseStatus(key)).toBe('valid')
  })
})
