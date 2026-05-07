import { describe, it, expect } from 'vitest';
import { signLicenseToken, verifyLicenseToken } from './licenseToken';

const SECRET = 'test-token-secret';

describe('signLicenseToken', () => {
  it('returns a token string and an ISO expiresAt', async () => {
    const { token, expiresAt } = await signLicenseToken('SONGBOOK-AAAA-BBBB-CCCC-DDDD', SECRET);
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('token expires roughly 24 hours from now', async () => {
    const before = Date.now();
    const { expiresAt } = await signLicenseToken('TEST-KEY', SECRET);
    const exp = new Date(expiresAt).getTime();
    expect(exp - before).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(exp - before).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });
});

describe('verifyLicenseToken', () => {
  it('returns true for a freshly signed token', async () => {
    const { token } = await signLicenseToken('SONGBOOK-TEST-KEY', SECRET);
    expect(await verifyLicenseToken(token, SECRET)).toBe(true);
  });

  it('returns false for a token signed with a different secret', async () => {
    const { token } = await signLicenseToken('SONGBOOK-TEST-KEY', SECRET);
    expect(await verifyLicenseToken(token, 'other-secret')).toBe(false);
  });

  it('returns false for a tampered payload', async () => {
    const { token } = await signLicenseToken('SONGBOOK-TEST-KEY', SECRET);
    const [payload, sig] = token.split('.');
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    expect(await verifyLicenseToken(`${tamperedPayload}.${sig}`, SECRET)).toBe(false);
  });

  it('returns false for undefined or empty input', async () => {
    expect(await verifyLicenseToken(undefined, SECRET)).toBe(false);
    expect(await verifyLicenseToken('', SECRET)).toBe(false);
    expect(await verifyLicenseToken('notadottoken', SECRET)).toBe(false);
  });

  it('returns false for an expired token', async () => {
    const payload = { sub: 'KEY', iat: 0, exp: Math.floor(Date.now() / 1000) - 1 };
    const payloadStr = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));
    const sigStr = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(await verifyLicenseToken(`${payloadStr}.${sigStr}`, SECRET)).toBe(false);
  });
});
