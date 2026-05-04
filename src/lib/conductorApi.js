// src/lib/conductorApi.js
function workerUrl() {
  return import.meta.env.VITE_WORKER_URL
}

export async function createConductorSession({ conductorCode, directorToken, maxFollowers }) {
  const res = await fetch(`${workerUrl()}/conductor/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conductorCode, directorToken, maxFollowers }),
  })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}

export async function fetchConductorStatus(code) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/status`)
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' })
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' })
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' })
  return res.json()
}

export async function startBroadcast(code, directorToken) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/start`, {
    method: 'POST',
    headers: { 'X-Conductor-Token': directorToken },
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('start_failed'), { code: 'start_failed' })
  return res.json()
}

export async function setCurrentSong(code, sbpId, directorToken) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/current`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Conductor-Token': directorToken },
    body: JSON.stringify({ sbpId }),
  })
  if (!res.ok) throw Object.assign(new Error('current_failed'), { code: 'current_failed' })
  return res.json()
}

export async function stopBroadcast(code, directorToken) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/stop`, {
    method: 'POST',
    headers: { 'X-Conductor-Token': directorToken },
  })
  if (!res.ok) throw Object.assign(new Error('stop_failed'), { code: 'stop_failed' })
  return res.json()
}

export async function joinBroadcast(code, clientId) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (res.status === 403) throw Object.assign(new Error('full'), { code: 'full' })
  if (!res.ok) throw Object.assign(new Error('join_failed'), { code: 'join_failed' })
  return res.json()
}

export async function sendFollowerHeartbeat(code, clientId) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (!res.ok) throw Object.assign(new Error('heartbeat_failed'), { code: 'heartbeat_failed' })
  return res.json()
}

export async function leaveBroadcast(code, clientId) {
  await fetch(`${workerUrl()}/conductor/${code}/join`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
}

export async function endBroadcast(code, conductorToken) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/end`, {
    method: 'POST',
    headers: { 'X-Conductor-Token': conductorToken },
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('end_failed'), { code: 'end_failed' })
  return res.json()
}

export async function previewSong(code, sbpId, conductorToken) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Conductor-Token': conductorToken },
    body: JSON.stringify({ sbpId }),
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('preview_failed'), { code: 'preview_failed' })
  return res.json()
}
