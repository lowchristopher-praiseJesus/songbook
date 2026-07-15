const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1'
const FIRECRAWL_V2_BASE = 'https://api.firecrawl.dev/v2'

// Accepts UG chord chart URLs:
//   modern: tabs.ultimate-guitar.com/tab/{artist}/{song}-chords-{id}
//   legacy: ultimate-guitar.com/guitar-chords/... or .../chords/...
const UG_CHORD_URL_RE = /ultimate-guitar\.com\/(guitar-chords|chords\/|tab\/[^?#]+-chords)/i

// UG can't build an artist/song slug for titles with no Latin characters (e.g. Chinese
// song names), so it falls back to a bare tab/{id} permalink with no "-chords" marker.
// We only trust these when the result title itself says "chords", to avoid pulling in
// bass/pro/ukulele tabs that use the same bare-ID URL shape.
const UG_BARE_TAB_URL_RE = /ultimate-guitar\.com\/tab\/\d+(?:[?#]|$)/i

async function firecrawlPost(endpoint, body, apiKey) {
  let res
  try {
    res = await fetch(`${FIRECRAWL_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('NETWORK_ERROR')
  }
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error('NETWORK_ERROR')
  return res.json()
}

/**
 * Fetch remaining/total Firecrawl credits for the current billing period.
 */
export async function getCreditUsage(apiKey) {
  let res
  try {
    res = await fetch(`${FIRECRAWL_V2_BASE}/team/credit-usage`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
  } catch {
    throw new Error('NETWORK_ERROR')
  }
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (res.status === 404) throw new Error('NOT_FOUND')
  if (!res.ok) throw new Error('NETWORK_ERROR')
  const { data } = await res.json()
  return data
}

/**
 * Generic Firecrawl search. Returns [{ url, title, description }].
 */
export async function firecrawlSearch(query, apiKey, limit = 8) {
  const data = await firecrawlPost('/search', { query, limit }, apiKey)
  return data.data ?? []
}

/**
 * Search Ultimate Guitar for chord charts matching the query.
 * Returns up to 8 filtered results: [{ url, title, description }]
 */
export async function searchUG(query, apiKey) {
  const items = await firecrawlSearch(`site:ultimate-guitar.com ${query} chords`, apiKey)
  return items.filter(item =>
    UG_CHORD_URL_RE.test(item.url) ||
    (UG_BARE_TAB_URL_RE.test(item.url) && /chord/i.test(item.title ?? ''))
  )
}

/**
 * Scrape a UG chord chart URL.
 * Returns { rawHtml, markdown } — rawHtml is used to extract store.page_data;
 * markdown is the fallback if JSON extraction fails.
 */
export async function scrapeURL(url, apiKey) {
  const data = await firecrawlPost('/scrape', {
    url,
    formats: ['rawHtml', 'markdown'],
  }, apiKey)
  return {
    rawHtml:  data.data?.rawHtml  ?? data.rawHtml  ?? '',
    markdown: data.data?.markdown ?? data.markdown ?? '',
  }
}
