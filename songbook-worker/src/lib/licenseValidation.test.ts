import { describe, it, expect } from 'vitest';
import { validateLicenseKey, isLicenseExpired } from './licenseValidation';

const SECRET = 'test-license-secret';

function makeTestKey(secret: string, expiresAt = 0, licenseType = 1): string {
  const { createHash } = require('node:crypto');
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bitsToChar = (v: number) => ALPHA[v & 0x1f];
  const bits = new Array(60).fill(0);
  const wb = (s: number, c: number, v: number) => {
    for (let i = c - 1; i >= 0; i--) { bits[s + i] = v & 1; v >>= 1; }
  };
  wb(0, 4, 0); wb(4, 31, expiresAt); wb(35, 4, licenseType); wb(39, 21, 42);
  let payload = '';
  for (let i = 0; i < 12; i++) {
    let v = 0; for (let b = 0; b < 5; b++) v = (v << 1) | bits[i * 5 + b];
    payload += bitsToChar(v);
  }
  const hash = createHash('md5').update(secret + payload).digest('hex');
  let hbits = 0;
  for (let i = 0; i < 5; i++) hbits = (hbits << 4) | parseInt(hash[i], 16);
  let ck = '';
  for (let i = 0; i < 4; i++) ck += bitsToChar((hbits >> (15 - i * 5)) & 0x1f);
  return `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${ck}`;
}

describe('validateLicenseKey (server)', () => {
  it('accepts a valid key with no expiry', () => {
    const key = makeTestKey(SECRET);
    const result = validateLicenseKey(key, SECRET);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.payload.expiresAt).toBe(0);
  });

  it('rejects a key whose checksum does not match the given secret', () => {
    const key = makeTestKey(SECRET);
    const result = validateLicenseKey(key, 'wrong-secret');
    expect(result.valid).toBe(false);
  });

  it('rejects a key with a tampered payload segment', () => {
    const key = makeTestKey(SECRET);
    const parts = key.split('-');
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    parts[2] = parts[2].split('').map((c, i) => i === 0 ? ALPHA[(ALPHA.indexOf(c) + 1) % 32] : c).join('');
    expect(validateLicenseKey(parts.join('-'), SECRET).valid).toBe(false);
  });

  it('rejects wrong format', () => {
    expect(validateLicenseKey('BLAH', SECRET).valid).toBe(false);
    expect(validateLicenseKey('SONGBOOK-AAAA-AAAA-AAAA', SECRET).valid).toBe(false);
  });

  it('accepts lowercase / padded whitespace input', () => {
    const key = makeTestKey(SECRET);
    expect(validateLicenseKey(key.toLowerCase(), SECRET).valid).toBe(true);
    expect(validateLicenseKey(`  ${key}  `, SECRET).valid).toBe(true);
  });
});

describe('isLicenseExpired (server)', () => {
  it('returns false when expiresAt is 0 (no expiry)', () => {
    expect(isLicenseExpired({ version: 0, expiresAt: 0, licenseType: 1 })).toBe(false);
  });

  it('returns false for a future timestamp', () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    expect(isLicenseExpired({ version: 0, expiresAt: future, licenseType: 1 })).toBe(false);
  });

  it('returns true for a past timestamp', () => {
    const past = Math.floor(Date.now() / 1000) - 86400;
    expect(isLicenseExpired({ version: 0, expiresAt: past, licenseType: 1 })).toBe(true);
  });
});
