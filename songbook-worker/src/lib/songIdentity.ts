/** Remove inline [Chord] tokens, leaving the lyric text. */
export function stripChords(body: string): string {
  return body.replace(/\[[^\]]*\]/g, '');
}

/**
 * Remove {note:} lines including the trailing newline, so no blank line is left behind.
 * Mirrors stripNoteTokens in src/lib/exportSbp.js — notes are private team chatter and
 * must never travel with a published chart.
 */
export function stripNotes(body: string): string {
  return body.replace(/\{note:[^}]*\}[^\n]*\n?/g, '');
}

/** Collapse whitespace so cosmetic spacing does not change a song's identity. */
export function normalizeBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

function normalizeField(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)\s*$/, '')     // trailing parentheticals: (Live), (Acoustic)
    .replace(/[^a-z0-9 ]/g, '')       // punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same song, different arrangement → same group_key. Used to cap arrangements per song. */
export function groupKey(title: string, artist: string): string {
  return `${normalizeField(title)}|${normalizeField(artist)}`;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Byte-identical charts from two publishers produce the same hash → exact-duplicate collapse. */
export async function contentHash(title: string, artist: string, body: string): Promise<string> {
  const material = `${normalizeField(title)} ${normalizeField(artist)} ${normalizeBody(body)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return toHex(digest);
}

/**
 * Turn a raw user query into a safe FTS5 MATCH expression. Unquoted user input can contain
 * FTS operators (OR, *, ^, ") that make MATCH throw a SQL error, which would surface as a
 * dead search box.
 */
export function toFtsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(' ');
}
