const WORKER_URL = import.meta.env.VITE_WORKER_URL;
if (!WORKER_URL && import.meta.env.DEV) {
  console.warn('VITE_WORKER_URL is not set. Create .env.local with VITE_WORKER_URL=https://...');
}

export async function uploadShare(blob, expiresInDays = 7, turnstileToken, locked = false, pin = null) {
  const headers = {
    'Content-Type': 'application/zip',
    'X-Expires-In-Days': String(expiresInDays),
    'X-Turnstile-Token': turnstileToken,
    'X-Locked': String(locked),
  };
  if (locked && pin) headers['X-Lock-Pin'] = pin;

  const res = await fetch(`${WORKER_URL}/share/upload`, {
    method: 'POST',
    headers,
    body: blob,
  });
  if (!res.ok) {
    const err = new Error('upload_failed');
    err.code = 'upload_failed';
    throw err;
  }
  return res.json();
}

async function getShare(shareCode) {
  // cache: 'no-store' — a live share blob changes on every Push Update; a cached copy
  // would silently merge stale data on refresh.
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, { cache: 'no-store' });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' });
  return res;
}

export async function fetchShare(shareCode) {
  return (await getShare(shareCode)).arrayBuffer();
}

// The version comes from the same response as the ZIP, so it is exactly the version
// whose content was downloaded — a separate HEAD could see a push that landed in between.
export async function fetchShareWithVersion(shareCode) {
  const res = await getShare(shareCode);
  const buffer = await res.arrayBuffer();
  const version = Number(res.headers.get('X-Share-Version') ?? 1);
  return { buffer, version };
}

export async function checkShareVersion(shareCode) {
  // cache: 'no-store' — the version header must reflect the current server state, never a
  // cached value, or "Check for updates" wrongly reports "Already up to date".
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, { method: 'HEAD', cache: 'no-store' });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' });
  const version = Number(res.headers.get('X-Share-Version') ?? 1);
  const locked = res.headers.get('X-Share-Locked') === 'true';
  const hasPin = res.headers.get('X-Share-Has-Pin') === 'true';
  const expiresAt = res.headers.get('X-Share-Expires-At') ?? null;
  return { version, locked, hasPin, expiresAt };
}

// baseVersion is the server version this push was built on. If someone else has
// pushed since, the worker rejects with 409 rather than silently overwriting their
// changes; the error carries the server's current version as `serverVersion`.
export async function updateShare(shareCode, blob, baseVersion = null) {
  const headers = { 'Content-Type': 'application/zip' };
  if (baseVersion != null) headers['X-Base-Version'] = String(baseVersion);
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, {
    method: 'PUT',
    headers,
    body: blob,
  });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (res.status === 423) throw Object.assign(new Error('locked'), { code: 'locked' });
  if (res.status === 409) {
    const { version } = await res.json().catch(() => ({}));
    throw Object.assign(new Error('stale'), { code: 'stale', serverVersion: version ?? null });
  }
  if (!res.ok) throw Object.assign(new Error('update_failed'), { code: 'update_failed' });
  return res.json();
}

export async function setShareLocked(shareCode, locked, pin = null) {
  const res = await fetch(`${WORKER_URL}/share/${shareCode}/lock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin ? { locked, pin } : { locked }),
  });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (res.status === 403) throw Object.assign(new Error('invalid_pin'), { code: 'invalid_pin' });
  if (res.status === 400) throw Object.assign(new Error('pin_required'), { code: 'pin_required' });
  if (!res.ok) throw Object.assign(new Error('lock_failed'), { code: 'lock_failed' });
  return res.json();
}
