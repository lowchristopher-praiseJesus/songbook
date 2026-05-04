import { useState, useCallback } from 'react'
import { fetchConductorStatus } from '../lib/conductorApi'

const MAX_POLLS = 5

/**
 * Fetches live status for up to MAX_POLLS unique conductor codes.
 * Returns a map of { [conductorCode]: { live, currentSbpId, followerCount, expiresAt, error } }
 * and a `refresh()` function to re-fetch all.
 *
 * Does NOT poll continuously — call refresh() when the panel is opened or the user requests it.
 */
export function useBroadcastStatuses(conductorCodes) {
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (conductorCodes.length === 0) return
    setLoading(true)
    const codes = [...new Set(conductorCodes)].slice(0, MAX_POLLS)
    const results = await Promise.allSettled(
      codes.map(code => fetchConductorStatus(code).then(s => ({ code, ...s })))
    )
    const next = {}
    for (const r of results) {
      if (r.status === 'fulfilled') {
        next[r.value.code] = r.value
      } else {
        const idx = results.indexOf(r)
        next[codes[idx]] = { error: r.reason?.code ?? 'network_error' }
      }
    }
    setStatuses(next)
    setLoading(false)
  }, [conductorCodes.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  return { statuses, loading, refresh }
}
