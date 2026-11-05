import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { utcDay, nextResetIso, getQuota, recordPick, PER_IP_DAILY } from '../src/lib/themeQuota';

const NOW = new Date('2026-11-05T23:59:00Z');

describe('day helpers', () => {
  it('utcDay formats the UTC date', () => {
    expect(utcDay(NOW)).toBe('2026-11-05');
  });

  it('nextResetIso is the next UTC midnight', () => {
    expect(nextResetIso(NOW)).toBe('2026-11-06T00:00:00.000Z');
  });
});

describe('quota', () => {
  it('a fresh IP has 5 picks', async () => {
    expect(PER_IP_DAILY).toBe(5);
    const q = await getQuota(env, '198.51.100.1', NOW);
    expect(q.remaining).toBe(5);
    expect(q.resetsAt).toBe('2026-11-06T00:00:00.000Z');
  });

  it('recordPick decrements the IP and the global counter', async () => {
    const before = await getQuota(env, '198.51.100.2', NOW);
    await recordPick(env, '198.51.100.2', NOW);
    const after = await getQuota(env, '198.51.100.2', NOW);
    expect(after.remaining).toBe(4);
    expect(after.globalRemaining).toBe(before.globalRemaining - 1);
  });

  it('never goes below zero and resets on the next UTC day', async () => {
    for (let i = 0; i < 6; i++) await recordPick(env, '198.51.100.3', NOW);
    expect((await getQuota(env, '198.51.100.3', NOW)).remaining).toBe(0);
    expect((await getQuota(env, '198.51.100.3', new Date('2026-11-06T00:00:01Z'))).remaining).toBe(5);
  });

  it('global cap reads THEME_PICK_GLOBAL_DAILY', async () => {
    const day = new Date('2026-12-01T10:00:00Z');
    const capped = { ...env, THEME_PICK_GLOBAL_DAILY: '2' };
    await recordPick(capped, '198.51.100.10', day);
    await recordPick(capped, '198.51.100.11', day);
    const q = await getQuota(capped, '198.51.100.12', day);
    expect(q.remaining).toBe(5);
    expect(q.globalRemaining).toBe(0);
  });

  it('global cap defaults to 200', async () => {
    const q = await getQuota(env, '198.51.100.20', new Date('2027-01-01T00:00:00Z'));
    expect(q.globalRemaining).toBe(200);
  });
});
