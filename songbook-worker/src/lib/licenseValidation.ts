import { createHash } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY_REGEX = /^SONGBOOK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export interface LicensePayload {
  version: number;
  expiresAt: number;
  licenseType: number;
}

function charToBits(ch: string): number {
  const i = ALPHABET.indexOf(ch);
  if (i === -1) throw new Error(`Invalid character: ${ch}`);
  return i;
}

function bitsToChar(bits: number): string {
  return ALPHABET[bits & 0x1f];
}

function decodePayload(chars: string): LicensePayload {
  if (chars.length !== 12) throw new Error('Payload must be 12 characters');
  const bits: number[] = [];
  for (let i = 0; i < 12; i++) {
    const v = charToBits(chars[i]);
    for (let b = 0; b < 5; b++) bits.push((v >> (4 - b)) & 1);
  }
  const readBits = (start: number, count: number): number => {
    let val = 0;
    for (let i = 0; i < count; i++) val = (val << 1) | bits[start + i];
    return val;
  };
  return {
    version: readBits(0, 4),
    expiresAt: readBits(4, 31),
    licenseType: readBits(35, 4),
  };
}

function computeChecksum(payload: string, secret: string): string {
  const hash = createHash('md5').update(secret + payload).digest('hex');
  let bits = 0;
  for (let i = 0; i < 5; i++) bits = (bits << 4) | parseInt(hash[i], 16);
  let checksum = '';
  for (let i = 0; i < 4; i++) checksum += bitsToChar((bits >> (15 - i * 5)) & 0x1f);
  return checksum;
}

export function validateLicenseKey(
  key: string,
  secret: string,
): { valid: false; error: string } | { valid: true; payload: LicensePayload } {
  if (!key || typeof key !== 'string') return { valid: false, error: 'No license key provided' };
  const cleaned = key.trim().toUpperCase();
  if (!KEY_REGEX.test(cleaned)) return { valid: false, error: 'Invalid license key format' };

  const segments = cleaned.split('-');
  const payload = segments[1] + segments[2] + segments[3];
  const claimedChecksum = segments[4];

  if (claimedChecksum !== computeChecksum(payload, secret)) {
    return { valid: false, error: 'Invalid license key' };
  }

  let payloadData: LicensePayload;
  try {
    payloadData = decodePayload(payload);
  } catch {
    return { valid: false, error: 'Invalid license key' };
  }

  if (payloadData.version > 1) return { valid: false, error: 'Unsupported license version' };
  return { valid: true, payload: payloadData };
}

export function isLicenseExpired(payload: LicensePayload): boolean {
  if (!payload || payload.expiresAt === 0) return false;
  return Date.now() / 1000 > payload.expiresAt;
}
