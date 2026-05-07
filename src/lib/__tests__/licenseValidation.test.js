import { describe, it, expect } from 'vitest'
import { isValidKeyFormat, getLicenseStatus } from '../licenseValidation'

const VALID_FORMAT = 'SONGBOOK-AAAA-BBBB-CCCC-DDDD'
const INVALID_FORMAT = 'SONGBOOK-AAAA-BBBB-CCCC'

describe('isValidKeyFormat', () => {
  it('returns true for a correctly formatted key', () => {
    expect(isValidKeyFormat(VALID_FORMAT)).toBe(true)
  })

  it('returns true for lowercase input', () => {
    expect(isValidKeyFormat(VALID_FORMAT.toLowerCase())).toBe(true)
  })

  it('returns true for input with surrounding whitespace', () => {
    expect(isValidKeyFormat(`  ${VALID_FORMAT}  `)).toBe(true)
  })

  it('returns false for missing segment', () => {
    expect(isValidKeyFormat(INVALID_FORMAT)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidKeyFormat(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidKeyFormat('')).toBe(false)
  })

  it('returns false for wrong prefix', () => {
    expect(isValidKeyFormat('XONGBOOK-AAAA-BBBB-CCCC-DDDD')).toBe(false)
  })
})

describe('getLicenseStatus', () => {
  it('returns missing for null', () => {
    expect(getLicenseStatus(null)).toBe('missing')
  })

  it('returns missing for empty string', () => {
    expect(getLicenseStatus('')).toBe('missing')
  })

  it('returns invalid_format for malformed key', () => {
    expect(getLicenseStatus(INVALID_FORMAT)).toBe('invalid_format')
  })

  it('returns unchecked for correctly formatted key (checksum not verified client-side)', () => {
    expect(getLicenseStatus(VALID_FORMAT)).toBe('unchecked')
  })
})
