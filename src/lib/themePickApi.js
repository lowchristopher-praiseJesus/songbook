const WORKER_URL = import.meta.env.VITE_WORKER_URL

const KNOWN_ERRORS = new Set([
  'daily_limit', 'global_limit', 'picker_unavailable', 'picker_bad_output', 'turnstile_failed', 'invalid_input',
])

function err(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra })
}

/** Today's theme-pick allowance for this connection, or null if the worker can't be reached. */
export async function getThemePickQuota() {
  try {
    const res = await fetch(`${WORKER_URL}/theme-pick/quota`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Ask the worker for `count` Community songs fitting `theme`, skipping `exclude` ids.
 * Resolves `{ picks, remaining }`; rejects with an Error whose `.code` names the failure
 * (and `.resetsAt` for the limit errors).
 */
export async function requestThemePicks({ theme, count, exclude = [], turnstileToken }) {
  let res
  try {
    res = await fetch(`${WORKER_URL}/theme-pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Turnstile-Token': turnstileToken },
      body: JSON.stringify({ theme, count, exclude }),
    })
  } catch {
    throw err('network_error')
  }

  let body = {}
  try { body = await res.json() } catch { /* non-JSON error page */ }

  if (res.ok) return body
  const code = KNOWN_ERRORS.has(body?.error) ? body.error : 'network_error'
  throw err(code, body?.resetsAt ? { resetsAt: body.resetsAt } : {})
}
