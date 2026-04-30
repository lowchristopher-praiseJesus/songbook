// songbook-worker/src/lib/conductor.ts
import { CONDUCTOR } from '../config';
import { generateCode } from './session';

export interface ConductorFollower {
  lastSeen: string; // ISO timestamp
}

export interface ConductorData {
  conductorCode: string;
  directorToken: string;
  maxFollowers: number;
  live: boolean;
  currentSbpId: number | null;
  version: number;
  followers: Record<string, ConductorFollower>;
  expiresAt: string;
}

export { generateCode };

export function kvKey(code: string): string {
  return `conductor:${code}`;
}

export async function getConductor(
  kv: KVNamespace,
  code: string,
): Promise<ConductorData | null> {
  const raw = await kv.get(kvKey(code));
  if (!raw) return null;
  return JSON.parse(raw) as ConductorData;
}

export async function putConductor(
  kv: KVNamespace,
  data: ConductorData,
): Promise<void> {
  const expiresAt = new Date(data.expiresAt);
  const ttlSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await kv.put(kvKey(data.conductorCode), JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
}

/** Count followers whose lastSeen is within FOLLOWER_TTL_SECONDS. */
export function countActiveFollowers(data: ConductorData): number {
  const cutoff = Date.now() - CONDUCTOR.FOLLOWER_TTL_SECONDS * 1000;
  return Object.values(data.followers).filter(
    f => new Date(f.lastSeen).getTime() > cutoff,
  ).length;
}

/** Remove stale follower entries (lazy cleanup). */
export function stripStaleFollowers(data: ConductorData): ConductorData {
  const cutoff = Date.now() - CONDUCTOR.FOLLOWER_TTL_SECONDS * 1000;
  const followers: Record<string, ConductorFollower> = {};
  for (const [id, f] of Object.entries(data.followers)) {
    if (new Date(f.lastSeen).getTime() > cutoff) followers[id] = f;
  }
  return { ...data, followers };
}

export function isConductorExpired(data: ConductorData): boolean {
  return new Date(data.expiresAt).getTime() <= Date.now();
}
