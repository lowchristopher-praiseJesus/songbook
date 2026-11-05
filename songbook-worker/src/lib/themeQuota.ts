import type { Env } from '../types';

export const PER_IP_DAILY = 5;
const DEFAULT_GLOBAL_DAILY = 200;
// Two days, so a key written just before midnight still exists for that whole UTC day.
const KEY_TTL_SECONDS = 172800;

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function nextResetIso(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

function globalLimit(env: Env): number {
  const n = Number(env.THEME_PICK_GLOBAL_DAILY ?? DEFAULT_GLOBAL_DAILY);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_GLOBAL_DAILY;
}

const ipKey = (ip: string, now: Date) => `themepick:ip:${ip}:${utcDay(now)}`;
const globalKey = (now: Date) => `themepick:global:${utcDay(now)}`;

async function readCount(env: Env, key: string): Promise<number> {
  return Number((await env.SESSION_KV.get(key)) ?? '0') || 0;
}

export async function getQuota(env: Env, ip: string, now: Date) {
  const [used, globalUsed] = await Promise.all([readCount(env, ipKey(ip, now)), readCount(env, globalKey(now))]);
  return {
    remaining: Math.max(0, PER_IP_DAILY - used),
    globalRemaining: Math.max(0, globalLimit(env) - globalUsed),
    resetsAt: nextResetIso(now),
  };
}

/**
 * Count one successful pick. KV is eventually consistent, so concurrent requests from one IP
 * can slightly overshoot the limit; the global cap bounds that.
 */
export async function recordPick(env: Env, ip: string, now: Date): Promise<void> {
  for (const key of [ipKey(ip, now), globalKey(now)]) {
    const n = await readCount(env, key);
    await env.SESSION_KV.put(key, String(n + 1), { expirationTtl: KEY_TTL_SECONDS });
  }
}

/**
 * Failed AI calls use no pick but still spend Abacus credits, so every call to the picker is
 * also counted as an attempt (before it runs): 15 per IP and 3× the global pick cap per day.
 */
export const ATTEMPTS_PER_IP = 15;
const attemptsIpKey = (ip: string, now: Date) => `themepick:attempts:ip:${ip}:${utcDay(now)}`;
const attemptsGlobalKey = (now: Date) => `themepick:attempts:global:${utcDay(now)}`;

export async function takeAttempt(env: Env, ip: string, now: Date): Promise<'ok' | 'daily_limit' | 'global_limit'> {
  const [ipUsed, globalUsed] = await Promise.all([
    readCount(env, attemptsIpKey(ip, now)),
    readCount(env, attemptsGlobalKey(now)),
  ]);
  if (ipUsed >= ATTEMPTS_PER_IP) return 'daily_limit';
  if (globalUsed >= globalLimit(env) * 3) return 'global_limit';
  await Promise.all([
    env.SESSION_KV.put(attemptsIpKey(ip, now), String(ipUsed + 1), { expirationTtl: KEY_TTL_SECONDS }),
    env.SESSION_KV.put(attemptsGlobalKey(now), String(globalUsed + 1), { expirationTtl: KEY_TTL_SECONDS }),
  ]);
  return 'ok';
}
