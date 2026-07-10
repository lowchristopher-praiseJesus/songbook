const WORKER_URL = import.meta.env.VITE_WORKER_URL;
if (!WORKER_URL && import.meta.env.DEV) {
  console.warn('VITE_WORKER_URL is not set. Create .env.local with VITE_WORKER_URL=https://...');
}

export async function uploadShare(blob, expiresInDays = 7, turnstileToken, locked = false) {
  const res = await fetch(`${WORKER_URL}/share/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-Expires-In-Days': String(expiresInDays),
      'X-Turnstile-Token': turnstileToken,
      'X-Locked': String(locked),
    },
    body: blob,
  });
  if (!res.ok) {
    const err = new Error('upload_failed');
    err.code = 'upload_failed';
    throw err;
  }
  return res.json();
}

export async function fetchShare(shareCode) {
  // cache: 'no-store' — a live share blob changes on every Push Update; a cached copy
  // would silently merge stale data on refresh.
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, { cache: 'no-store' });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' });
  return res.arrayBuffer();
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
  return { version, locked };
}

export async function updateShare(shareCode, blob) {
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/zip' },
    body: blob,
  });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (res.status === 423) throw Object.assign(new Error('locked'), { code: 'locked' });
  if (!res.ok) throw Object.assign(new Error('update_failed'), { code: 'update_failed' });
  return res.json();
}

export async function setShareLocked(shareCode, locked) {
  const res = await fetch(`${WORKER_URL}/share/${shareCode}/lock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked }),
  });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('lock_failed'), { code: 'lock_failed' });
  return res.json();
}
