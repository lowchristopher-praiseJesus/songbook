import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  saveLicenseToken, loadLicenseToken, clearLicenseToken, isTokenExpired,
} from '../licenseApi'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function makeToken(expOffsetSeconds) {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds
  const payload = btoa(JSON.stringify({ sub: 'KEY', iat: 0, exp }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${payload}.fakesig`
}

describe('localStorage helpers', () => {
  it('saveLicenseToken stores the token', () => {
    saveLicenseToken('my-token')
    expect(localStorage.getItem('songsheet_license_token')).toBe('my-token')
  })

  it('loadLicenseToken returns the stored value', () => {
    localStorage.setItem('songsheet_license_token', 'stored-token')
    expect(loadLicenseToken()).toBe('stored-token')
  })

  it('loadLicenseToken returns null when nothing stored', () => {
    expect(loadLicenseToken()).toBeNull()
  })

  it('clearLicenseToken removes the stored value', () => {
    localStorage.setItem('songsheet_license_token', 'stored-token')
    clearLicenseToken()
    expect(localStorage.getItem('songsheet_license_token')).toBeNull()
  })
})

describe('isTokenExpired', () => {
  it('returns true for null', () => {
    expect(isTokenExpired(null)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isTokenExpired('')).toBe(true)
  })

  it('returns true for a token whose exp is in the past', () => {
    expect(isTokenExpired(makeToken(-1))).toBe(true)
  })

  it('returns false for a token whose exp is in the future', () => {
    expect(isTokenExpired(makeToken(3600))).toBe(false)
  })

  it('returns true for a malformed token', () => {
    expect(isTokenExpired('not.a.real.token.at.all')).toBe(true)
  })
})
