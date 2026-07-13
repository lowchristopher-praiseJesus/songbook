const WORKER_URL = import.meta.env.VITE_WORKER_URL

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

function err(code) {
  return Object.assign(new Error(code), { code })
}

/** The subtitle shown under a community row in the shared search results. */
function describeArrangement(r) {
  const parts = []
  if (typeof r.keyIndex === 'number') parts.push(`Key ${KEY_NAMES[r.keyIndex % 12]}`)
  if (r.capo) parts.push(`capo ${r.capo}`)
  if (r.collectionName) parts.push(`from "${r.collectionName}"`)
  parts.push(`${r.importCount} import${r.importCount === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/**
 * Search the community pool. Result shape matches what UGSearchModal expects from every
 * source. `url` is synthetic (`community:<id>`): the result list keys rows on r.url, and
 * fetchAndParseSong dispatches on `source` before it ever looks at `url`.
 */
export async function searchCommunity(query) {
  if (!query?.trim()) return []

  const res = await fetch(`${WORKER_URL}/community/search?q=${encodeURIComponent(query.trim())}`)
  if (!res.ok) throw err('network_error')

  const { results } = await res.json()
  return (results ?? []).map(r => ({
    ...r,
    url: `community:${r.id}`,
    source: 'community',
    description: describeArrangement(r),
  }))
}

export async function fetchCommunityArrangement(id) {
  const res = await fetch(`${WORKER_URL}/community/arrangement/${id}`)
  if (res.status === 404) throw err('not_found')
  if (!res.ok) throw err('network_error')
  return res.json()
}

/** Fire-and-forget popularity counter. Never throws — the song is already imported. */
export async function recordCommunityImport(id) {
  try {
    await fetch(`${WORKER_URL}/community/arrangement/${id}/import`, { method: 'POST' })
  } catch {
    // ignored on purpose
  }
}

export async function reportCommunityArrangement(id, reason) {
  const res = await fetch(`${WORKER_URL}/community/arrangement/${id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw err('report_failed')
}

export async function publishCollection({ collectionName, publisherName, songs, turnstileToken }) {
  const res = await fetch(`${WORKER_URL}/community/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Turnstile-Token': turnstileToken,
    },
    body: JSON.stringify({ collectionName, publisherName, songs }),
  })
  if (res.status === 429) throw err('rate_limited')
  if (!res.ok) throw err('publish_failed')
  return res.json()
}

export async function unpublishCollection(publicationId, publishToken) {
  const res = await fetch(`${WORKER_URL}/community/publication/${publicationId}`, {
    method: 'DELETE',
    headers: { 'X-Publish-Token': publishToken },
  })
  if (res.status === 403) throw err('invalid_token')
  if (!res.ok) throw err('unpublish_failed')
}
