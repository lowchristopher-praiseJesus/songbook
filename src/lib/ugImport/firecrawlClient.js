const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1'

// Accepts both /guitar-chords/ and /chords/ UG URL patterns
const UG_CHORD_URL_RE = /ultimate-guitar\.com\/(guitar-chords|chords)\//

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
 * Search Ultimate Guitar for chord charts matching the query.
 * Returns up to 8 filtered results: [{ url, title, description }]
 */
export async function searchUG(query, apiKey) {
  const data = await firecrawlPost('/search', {
    query: `site:ultimate-guitar.com ${query} chords`,
    limit: 8,
  }, apiKey)
  return (data.data ?? []).filter(item => UG_CHORD_URL_RE.test(item.url))
}

/**
 * Scrape a UG chord chart URL and return the markdown content string.
 */
export async function scrapeURL(url, apiKey) {
  const data = await firecrawlPost('/scrape', {
    url,
    formats: ['markdown'],
  }, apiKey)
  return data.data?.markdown ?? data.markdown ?? ''
}
