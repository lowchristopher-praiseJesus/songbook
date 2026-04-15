export interface SongMeta {
  title: string;
  artist?: string;
  keyIndex: number;
  usesFlats: boolean;
  capo?: number;
  tempo?: number;
  timeSig?: string;
}

export interface SessionSong {
  meta: SongMeta;
  rawText: string;
}

export interface EditLock {
  clientId: string;
  lockedAt: string;
  expiresAt: string;
}

export interface SessionData {
  code: string;
  name: string;
  leaderToken: string;
  createdAt: string;
  expiresAt: string;
  closed: boolean;
  version: number;
  setList: string[];
  songs: Record<string, SessionSong>;
  editLocks: Record<string, EditLock>;
}

// 6-char code from unambiguous uppercase chars (no 0,O,I,1)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateCode(): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => CHARSET[b % CHARSET.length]).join('');
}

export function kvKey(code: string): string {
  return `session:${code}`;
}

export async function getSession(
  kv: KVNamespace,
  code: string,
): Promise<SessionData | null> {
  const raw = await kv.get(kvKey(code));
  if (!raw) return null;
  return JSON.parse(raw) as SessionData;
}

export async function putSession(
  kv: KVNamespace,
  session: SessionData,
): Promise<void> {
  const expiresAt = new Date(session.expiresAt);
  const ttlSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await kv.put(kvKey(session.code), JSON.stringify(session), {
    expirationTtl: ttlSeconds,
  });
}

/** Strip expired locks without writing back (lazy cleanup). */
export function stripExpiredLocks(session: SessionData): SessionData {
  const now = Date.now();
  const editLocks: Record<string, EditLock> = {};
  for (const [songId, lock] of Object.entries(session.editLocks)) {
    if (new Date(lock.expiresAt).getTime() > now) {
      editLocks[songId] = lock;
    }
  }
  return { ...session, editLocks };
}

/** Returns true if session is expired or closed. */
export function isSessionDead(session: SessionData): boolean {
  return session.closed || new Date(session.expiresAt).getTime() <= Date.now();
}

export type OpType = 'add_song' | 'remove_song' | 'move_song' | 'update_song';

export interface Op {
  type: OpType;
  songId: string;
  song?: SessionSong;
  afterSongId?: string | null;
}

/** Apply an op to session state, returns updated session with version+1.
 *  Returns session unchanged (no version bump) if the op has missing preconditions. */
export function applyOp(session: SessionData, op: Op): SessionData {
  const songs = { ...session.songs };
  let setList = [...session.setList];
  let changed = false;

  switch (op.type) {
    case 'add_song': {
      if (!op.song) break;
      songs[op.songId] = op.song;
      if (!setList.includes(op.songId)) setList.push(op.songId);
      changed = true;
      break;
    }
    case 'remove_song': {
      delete songs[op.songId];
      setList = setList.filter(id => id !== op.songId);
      changed = true;
      break;
    }
    case 'move_song': {
      // Guard: only reorder songs that already exist in the set list
      if (!setList.includes(op.songId)) break;
      setList = setList.filter(id => id !== op.songId);
      if (op.afterSongId == null) {
        setList.unshift(op.songId);
      } else {
        const idx = setList.indexOf(op.afterSongId);
        // If afterSongId not found (stale reference), move to front
        setList.splice(idx + 1, 0, op.songId);
      }
      changed = true;
      break;
    }
    case 'update_song': {
      if (!op.song || !songs[op.songId]) break;
      songs[op.songId] = op.song;
      changed = true;
      break;
    }
  }

  if (!changed) return session;
  return { ...session, songs, setList, version: session.version + 1 };
}
