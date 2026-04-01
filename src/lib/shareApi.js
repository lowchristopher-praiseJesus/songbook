const WORKER_URL = import.meta.env.VITE_WORKER_URL;

export async function uploadShare(blob, expiresInDays = 7) {
  const res = await fetch(`${WORKER_URL}/share/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-Expires-In-Days': String(expiresInDays),
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
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`);
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' });
  return res.arrayBuffer();
}
