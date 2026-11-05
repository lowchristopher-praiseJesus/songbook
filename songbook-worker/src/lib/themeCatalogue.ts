import type { Env } from '../types';
import { normalizeField } from './songIdentity';

export interface CatalogueEntry {
  id: string;
  title: string;
  artist: string;
  excerpt: string;
}

const CACHE_KEY = 'themepick:catalogue:v1';
const CACHE_TTL_SECONDS = 3600;

/**
 * Title-only identity for the theme picker. Stricter than groupKey (which includes artist):
 * the Community holds the same song under several artists and with uploader suffixes such as
 * "(Kenneth)", "260712 PLQ", "- G" or "++", and the AI must never be offered two copies.
 */
export function normalizeTitle(title: string): string {
  let t = title.trim();
  let prev: string;
  do {
    prev = t;
    t = t
      .replace(/\++$/, '')
      .replace(/\s+\d{6}\s+PLQ$/i, '')
      .replace(/\s+-\s+\S{1,3}$/, '')
      .replace(/\s*\([^)]*\)$/, '')
      .trim();
  } while (t !== prev);
  return normalizeField(t);
}

/** Lyric text only: no [chords], no {directives}, whitespace collapsed, capped at `max` chars. */
export function lyricExcerpt(body: string, max = 400): string {
  return body
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

interface Row {
  id: string; title: string; artist: string | null; body: string;
  import_count: number; first_published_at: number;
}

/** Every live Community song, one per normalised title (most imported, then most recent). */
export async function buildCatalogue(env: Env): Promise<CatalogueEntry[]> {
  const cached = await env.SESSION_KV.get(CACHE_KEY, 'json');
  if (cached) return cached as CatalogueEntry[];

  const { results } = await env.DB.prepare(
    `SELECT id, title, artist, body, import_count, first_published_at FROM songs WHERE status = 'live'`
  ).all<Row>();

  const best = new Map<string, Row>();
  for (const row of results) {
    const key = normalizeTitle(row.title);
    if (!key) continue;
    const cur = best.get(key);
    if (
      !cur ||
      row.import_count > cur.import_count ||
      (row.import_count === cur.import_count && row.first_published_at > cur.first_published_at)
    ) {
      best.set(key, row);
    }
  }

  const catalogue = [...best.values()].map(r => ({
    id: r.id,
    title: r.title,
    artist: r.artist ?? '',
    excerpt: lyricExcerpt(r.body),
  }));
  await env.SESSION_KV.put(CACHE_KEY, JSON.stringify(catalogue), { expirationTtl: CACHE_TTL_SECONDS });
  return catalogue;
}
