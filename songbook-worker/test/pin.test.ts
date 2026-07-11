import { describe, it, expect } from 'vitest';
import { isValidPinFormat, generateSalt, hashPin } from '../src/lib/pin';

describe('isValidPinFormat', () => {
  it('accepts a 4-digit string', () => {
    expect(isValidPinFormat('1234')).toBe(true);
  });

  it('rejects strings that are not exactly 4 digits', () => {
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('12345')).toBe(false);
    expect(isValidPinFormat('12a4')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidPinFormat(1234)).toBe(false);
    expect(isValidPinFormat(undefined)).toBe(false);
    expect(isValidPinFormat(null)).toBe(false);
  });
});

describe('generateSalt', () => {
  it('returns a 32-character hex string', () => {
    expect(generateSalt()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns a different value on each call', () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });
});

describe('hashPin', () => {
  it('returns a 64-character hex string (SHA-256 digest)', async () => {
    const hash = await hashPin('1234', 'somesalt');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same pin and salt', async () => {
    const a = await hashPin('1234', 'salt1');
    const b = await hashPin('1234', 'salt1');
    expect(a).toBe(b);
  });

  it('differs for different pins with the same salt', async () => {
    const a = await hashPin('1234', 'salt1');
    const b = await hashPin('5678', 'salt1');
    expect(a).not.toBe(b);
  });

  it('differs for the same pin with different salts', async () => {
    const a = await hashPin('1234', 'salt1');
    const b = await hashPin('1234', 'salt2');
    expect(a).not.toBe(b);
  });
});
