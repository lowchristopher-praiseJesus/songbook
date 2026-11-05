import type { CatalogueEntry } from './themeCatalogue';

export type Section = 'opening' | 'middle' | 'close';

export interface Pick {
  id: string;
  title: string;
  artist: string;
  section: Section;
  reason: string;
}

const SECTIONS = new Set<string>(['opening', 'middle', 'close']);
const MAX_REASON = 200;

/**
 * Keep only picks that name a real catalogue song, once each, not excluded, with a known
 * section and a string reason; at most `count`. Title and artist always come from the
 * catalogue — the AI's spelling is never shown to the user.
 */
export function validatePicks(raw: unknown, catalogue: CatalogueEntry[], exclude: string[], count: number): Pick[] {
  const list = (raw as { picks?: unknown } | null)?.picks;
  if (!Array.isArray(list)) return [];

  const byId = new Map(catalogue.map(c => [c.id, c]));
  const excluded = new Set(exclude);
  const seen = new Set<string>();
  const out: Pick[] = [];

  for (const item of list) {
    if (out.length >= count) break;
    if (!item || typeof item !== 'object') continue;
    const { id, section, reason } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof reason !== 'string' || typeof section !== 'string') continue;
    const song = byId.get(id);
    if (!song || seen.has(id) || excluded.has(id) || !SECTIONS.has(section)) continue;
    seen.add(id);
    out.push({ id, title: song.title, artist: song.artist, section: section as Section, reason: reason.slice(0, MAX_REASON) });
  }
  return out;
}
