import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
const headers = { 'Content-Type': 'application/json', 'Origin': ORIGIN };

async function createSession(body = {}) {
  return SELF.fetch('http://localhost/session/create', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /session/create', () => {
  it('creates a session and returns code + urls', async () => {
    const res = await createSession({ name: 'Sunday Service' });
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, string>;
    expect(data.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(data.leaderToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.memberUrl).toContain('?session=');
    expect(data.leaderUrl).toContain('&token=');
    expect(data.expiresAt).toBeDefined();
  });

  it('seeds setList from songs array', async () => {
    const song = { id: 'song-1', meta: { title: 'Oceans', keyIndex: 9, usesFlats: false }, rawText: 'lyrics' };
    const res = await createSession({ name: 'Test', songs: [song] });
    const data = await res.json() as { code: string };

    const stateRes = await SELF.fetch(`http://localhost/session/${data.code}/state`, { headers: { Origin: ORIGIN } });
    const state = await stateRes.json() as { setList: string[]; songs: Record<string, unknown> };
    expect(state.setList).toContain('song-1');
    expect(state.songs['song-1']).toBeDefined();
  });

  it('defaults name to a date string when name is omitted', async () => {
    const res = await createSession({});
    const data = await res.json() as { code: string };
    const stateRes = await SELF.fetch(`http://localhost/session/${data.code}/state`, { headers: { Origin: ORIGIN } });
    const state = await stateRes.json() as { name: string };
    expect(state.name.length).toBeGreaterThan(0);
  });
});

describe('GET /session/:code/state', () => {
  it('returns 404 for unknown code', async () => {
    const res = await SELF.fetch('http://localhost/session/XXXXXX/state', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);
  });

  it('does not expose leaderToken in state response', async () => {
    const res = await createSession({ name: 'Secret' });
    const { code } = await res.json() as { code: string };

    const stateRes = await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } });
    const state = await stateRes.json() as Record<string, unknown>;
    expect(state.leaderToken).toBeUndefined();
  });
});

describe('POST /session/:code/op', () => {
  it('add_song adds a song and increments version', async () => {
    const { code } = await (await createSession({ name: 'Test' })).json() as { code: string };
    const song = { id: 'song-a', meta: { title: 'El Shaddai', keyIndex: 3, usesFlats: true }, rawText: 'text' };

    const opRes = await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'add_song', songId: 'song-a', song: song }),
    });
    expect(opRes.status).toBe(200);
    const { version } = await opRes.json() as { version: number };
    expect(version).toBe(1);

    const state = await (await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } })).json() as { setList: string[] };
    expect(state.setList).toContain('song-a');
  });

  it('remove_song removes a song idempotently', async () => {
    const song = { id: 'song-b', meta: { title: 'Test', keyIndex: 0, usesFlats: false }, rawText: '' };
    const { code } = await (await createSession({ name: 'Test', songs: [song] })).json() as { code: string };

    await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'remove_song', songId: 'song-b' }),
    });
    // Remove again — should be no error
    const res2 = await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'remove_song', songId: 'song-b' }),
    });
    expect(res2.status).toBe(200);

    const state = await (await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } })).json() as { setList: string[] };
    expect(state.setList).not.toContain('song-b');
  });

  it('move_song reorders setList', async () => {
    const songs = [
      { id: 'a', meta: { title: 'A', keyIndex: 0, usesFlats: false }, rawText: '' },
      { id: 'b', meta: { title: 'B', keyIndex: 0, usesFlats: false }, rawText: '' },
      { id: 'c', meta: { title: 'C', keyIndex: 0, usesFlats: false }, rawText: '' },
    ];
    const { code } = await (await createSession({ name: 'Test', songs })).json() as { code: string };

    // Move 'c' to after 'a' → order: a, c, b
    await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'move_song', songId: 'c', afterSongId: 'a' }),
    });

    const state = await (await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } })).json() as { setList: string[] };
    expect(state.setList).toEqual(['a', 'c', 'b']);
  });
});

describe('Edit lock endpoints', () => {
  it('acquires and releases a lock', async () => {
    const { code } = await (await createSession({ name: 'T', songs: [{ id: 's1', meta: { title: 'X', keyIndex: 0, usesFlats: false }, rawText: '' }] })).json() as { code: string };

    const lockRes = await SELF.fetch(`http://localhost/session/${code}/lock/s1`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(lockRes.status).toBe(200);

    const releaseRes = await SELF.fetch(`http://localhost/session/${code}/lock/s1`, {
      method: 'DELETE', headers,
      body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(releaseRes.status).toBe(204);
  });

  it('returns 423 when another client holds the lock', async () => {
    const { code } = await (await createSession({ name: 'T', songs: [{ id: 's2', meta: { title: 'X', keyIndex: 0, usesFlats: false }, rawText: '' }] })).json() as { code: string };

    await SELF.fetch(`http://localhost/session/${code}/lock/s2`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-a' }),
    });

    const res = await SELF.fetch(`http://localhost/session/${code}/lock/s2`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-b' }),
    });
    expect(res.status).toBe(423);
    const body = await res.json() as Record<string, unknown>;
    expect(body.lockedUntil).toBeDefined();
  });
});

describe('POST /session/:code/heartbeat/:songId', () => {
  it('extends lock expiry for current lock holder', async () => {
    const { code } = await (await createSession({ name: 'T', songs: [{ id: 'h1', meta: { title: 'X', keyIndex: 0, usesFlats: false }, rawText: '' }] })).json() as { code: string };

    // Acquire lock first
    await SELF.fetch(`http://localhost/session/${code}/lock/h1`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-x' }),
    });

    const res = await SELF.fetch(`http://localhost/session/${code}/heartbeat/h1`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-x' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { expiresAt: string };
    expect(body.expiresAt).toBeDefined();
    // expiresAt should be roughly 2 minutes from now
    const expiry = new Date(body.expiresAt).getTime();
    expect(expiry).toBeGreaterThan(Date.now() + 90_000);
  });

  it('returns 404 when clientId does not match lock holder', async () => {
    const { code } = await (await createSession({ name: 'T', songs: [{ id: 'h2', meta: { title: 'X', keyIndex: 0, usesFlats: false }, rawText: '' }] })).json() as { code: string };

    await SELF.fetch(`http://localhost/session/${code}/lock/h2`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-x' }),
    });

    const res = await SELF.fetch(`http://localhost/session/${code}/heartbeat/h2`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-y' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 410 when session is closed', async () => {
    const { code, leaderToken } = await (await createSession({ name: 'T', songs: [{ id: 'h3', meta: { title: 'X', keyIndex: 0, usesFlats: false }, rawText: '' }] })).json() as { code: string; leaderToken: string };

    // Acquire lock
    await SELF.fetch(`http://localhost/session/${code}/lock/h3`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-z' }),
    });

    // Close the session
    await SELF.fetch(`http://localhost/session/${code}/close`, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'X-Leader-Token': leaderToken },
    });

    // Heartbeat on a closed session should 410
    const res = await SELF.fetch(`http://localhost/session/${code}/heartbeat/h3`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-z' }),
    });
    expect(res.status).toBe(410);
  });
});

describe('POST /session/:code/close', () => {
  it('closes session with valid leader token', async () => {
    const { code, leaderToken } = await (await createSession({ name: 'T' })).json() as { code: string; leaderToken: string };

    const res = await SELF.fetch(`http://localhost/session/${code}/close`, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'X-Leader-Token': leaderToken },
    });
    expect(res.status).toBe(200);

    const stateRes = await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } });
    expect(stateRes.status).toBe(410);
  });

  it('returns 403 with wrong leader token', async () => {
    const { code } = await (await createSession({ name: 'T' })).json() as { code: string };
    const res = await SELF.fetch(`http://localhost/session/${code}/close`, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'X-Leader-Token': 'wrong-token' },
    });
    expect(res.status).toBe(403);
  });
});
