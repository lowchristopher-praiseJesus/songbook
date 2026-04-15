const WORKER_URL = import.meta.env.VITE_WORKER_URL
if (!WORKER_URL && import.meta.env.DEV) {
  console.warn('VITE_WORKER_URL is not set. Create .env.local with VITE_WORKER_URL=https://...')
}

export async function createSession({ name = '', songs = [] } = {}) {
  const res = await fetch(`${WORKER_URL}/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, songs }),
  })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}

export async function fetchSessionState(code) {
  const res = await fetch(`${WORKER_URL}/session/${code}/state`)
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' })
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' })
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' })
  return res.json()
}

export async function submitOp(code, op) {
  const res = await fetch(`${WORKER_URL}/session/${code}/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  if (!res.ok) throw Object.assign(new Error('op_failed'), { code: 'op_failed' })
  return res.json()
}

export async function acquireLock(code, songId, clientId) {
  const res = await fetch(`${WORKER_URL}/session/${code}/lock/${songId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (res.status === 423) {
    const data = await res.json()
    throw Object.assign(new Error('locked'), { code: 'locked', lockedUntil: data.lockedUntil })
  }
  if (!res.ok) throw Object.assign(new Error('lock_failed'), { code: 'lock_failed' })
  return res.json()
}

export async function sendHeartbeat(code, songId, clientId) {
  const res = await fetch(`${WORKER_URL}/session/${code}/heartbeat/${songId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' })
  if (!res.ok) throw Object.assign(new Error('heartbeat_failed'), { code: 'heartbeat_failed' })
  return res.json()
}

export async function releaseLock(code, songId, clientId) {
  await fetch(`${WORKER_URL}/session/${code}/lock/${songId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
}

export async function closeSession(code, leaderToken) {
  const res = await fetch(`${WORKER_URL}/session/${code}/close`, {
    method: 'POST',
    headers: { 'X-Leader-Token': leaderToken },
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('close_failed'), { code: 'close_failed' })
}
