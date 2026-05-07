const WORKER_URL = import.meta.env.VITE_WORKER_URL
const TOKEN_KEY = 'songsheet_license_token'

/**
 * Call the worker to validate a license key.
 * On success, returns { token, expiresAt }.
 * Throws with err.code = 'invalid' | 'expired' | 'network_error' on failure.
 */
export async function validateLicenseWithServer(key) {
  let res
  try {
    res = await fetch(`${WORKER_URL}/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
  } catch {
    throw Object.assign(new Error('network_error'), { code: 'network_error' })
  }
  if (res.status === 422) throw Object.assign(new Error('invalid'), { code: 'invalid' })
  if (res.status === 403) throw Object.assign(new Error('expired'), { code: 'expired' })
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' })
  return res.json()
}

export function saveLicenseToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function loadLicenseToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearLicenseToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Decode the exp claim from the token payload without verifying the signature.
 * Signature verification happens server-side on /conductor/create.
 * Returns true if the token is missing, malformed, or expired.
 */
export function isTokenExpired(token) {
  if (!token) return true
  try {
    const [, payloadB64] = token.split('.')
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    const { exp } = JSON.parse(json)
    return !exp || Date.now() / 1000 >= exp
  } catch {
    return true
  }
}
