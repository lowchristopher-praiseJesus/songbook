# Firecrawl Credit Indicator in Settings

**Date:** 2026-07-14
**Status:** Approved

## Problem

The Settings panel lets the user enter their own Firecrawl API key (`src/components/Settings/SettingsPanel.jsx`), which is used directly from the browser for UG chord-chart search/scrape and YouTube search (`src/lib/ugImport/firecrawlClient.js`). Firecrawl is a paid, credit-metered service, but the app gives no visibility into remaining balance — the user only finds out they've run out when a search/scrape call starts failing. There is no existing "API credits remaining" UI anywhere in the app.

## Goals

1. When a Firecrawl key is present, show how many credits remain against the plan total for the current billing period, right in Settings.
2. Refresh this automatically when Settings opens and when the key is edited, without hammering the API on every keystroke.
3. Degrade gracefully (and legibly) when the key is invalid, the service is unreachable, or the account has no billing info.

## Non-Goals

- Historical/month-by-month usage breakdown (Firecrawl's `/v2/team/credit-usage/historical` endpoint) — out of scope; may be a future addition but isn't needed to show current balance.
- Warning banners, notifications, or blocking behavior when credits run low elsewhere in the app (e.g. before a scrape call). This spec only covers the Settings display.
- Any change to how the Firecrawl key itself is stored, validated, or committed.

## Architecture

### 1. `src/lib/ugImport/firecrawlClient.js` — new `getCreditUsage` function

Firecrawl's account endpoints are v2 (the existing `firecrawlPost` helper targets v1 for `/search` and `/scrape`), so this adds a second base constant and a small GET helper:

```js
const FIRECRAWL_V2_BASE = 'https://api.firecrawl.dev/v2'

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
  return data // { remainingCredits, planCredits, billingPeriodStart, billingPeriodEnd }
}
```

This follows the existing error-normalization convention in the file (`NETWORK_ERROR` / `UNAUTHORIZED`), adding `NOT_FOUND` for the one new case this endpoint can return (per Firecrawl's docs, a 404 means "could not find credit usage information" — e.g. an account with no billing plan).

### 2. `SettingsPanel.jsx` — new local state + effect

```js
const [creditUsage, setCreditUsageState] = useState({ status: 'idle', data: null, error: null })
```

`status` is one of `'idle' | 'loading' | 'success' | 'error'`.

A `useEffect` keyed on the trimmed `firecrawlKey`:
- If the trimmed key is empty, reset to `{ status: 'idle', data: null, error: null }` and do nothing else.
- Otherwise, debounce 600ms (existing timer cleared on each change), then set `status: 'loading'` and call `getCreditUsage(key)`.
- On success: `{ status: 'success', data, error: null }`.
- On failure: `{ status: 'error', data: null, error: err.message }` (one of `NETWORK_ERROR` / `UNAUTHORIZED` / `NOT_FOUND`).

This fires once on mount (since the effect runs immediately with whatever key was loaded from storage) and again ~600ms after the user stops editing the field — the Firecrawl input commits on every keystroke today (`handleKeyChange`, line 22-25), so fetching on each keystroke without debouncing would spam the endpoint.

### 3. Display — new block under the existing Firecrawl key field's helper text

Modeled on the existing storage-usage bar (lines 241-254):

```jsx
{creditUsage.status === 'loading' && (
  <p className="mt-2 text-xs text-gray-400">Checking credit balance…</p>
)}
{creditUsage.status === 'success' && (
  <div className="mt-2">
    <p className="text-xs text-gray-500 dark:text-gray-400">
      {`${creditUsage.data.remainingCredits.toLocaleString()} / ${creditUsage.data.planCredits.toLocaleString()} credits remaining`}
    </p>
    <div className="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div
        data-testid="firecrawl-credit-bar"
        className="h-full bg-indigo-600 rounded-full"
        style={{ width: `${Math.min(100, ((creditUsage.data.planCredits - creditUsage.data.remainingCredits) / creditUsage.data.planCredits) * 100)}%` }}
      />
    </div>
  </div>
)}
{creditUsage.status === 'error' && (
  <p className={`mt-2 text-xs ${creditUsage.error === 'UNAUTHORIZED' ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
    {creditUsage.error === 'UNAUTHORIZED' && 'Invalid API key'}
    {creditUsage.error === 'NOT_FOUND' && 'Credit usage not available for this key'}
    {creditUsage.error === 'NETWORK_ERROR' && 'Could not check credit balance'}
  </p>
)}
```

Bar width represents credits *consumed* (`planCredits - remainingCredits`) out of `planCredits`, consistent with the storage bar's "used vs. limit" framing. No bar is rendered on error — only the status line, per the same visual convention as the license key's status messages (lines 225-238).

## What Does Not Change

- Firecrawl key storage, input behavior, or the "Show/Hide" toggle
- `firecrawlSearch` / `scrapeURL` and their v1 base URL / POST helper
- Any other Settings tab or section (license, storage, display, danger zone)

## Files Changed

| File | Change |
|------|--------|
| `src/lib/ugImport/firecrawlClient.js` | Add `FIRECRAWL_V2_BASE` + `getCreditUsage(apiKey)` |
| `src/lib/ugImport/__tests__/firecrawlClient.test.js` | Tests for `getCreditUsage`: success shape, 401, 404, network failure |
| `src/components/Settings/SettingsPanel.jsx` | Add `creditUsage` state, debounced fetch effect, and display block |
| `src/components/Settings/__tests__/SettingsPanel.test.jsx` | Tests for loading/success/error rendering; fake timers to verify debounce |

## Testing

- `firecrawlClient.test.js`: mock `fetch`, assert `getCreditUsage` returns `{ remainingCredits, planCredits, billingPeriodStart, billingPeriodEnd }` on 200, throws `UNAUTHORIZED` on 401, `NOT_FOUND` on 404, `NETWORK_ERROR` on fetch rejection and other non-ok statuses.
- `SettingsPanel.test.jsx`: mock `getCreditUsage`; with a pre-existing key, assert `firecrawl-credit-bar` renders with the correct `width` after the debounce fires (`vi.useFakeTimers()` + `vi.advanceTimersByTime(600)`); assert the loading text appears before that; assert each error variant renders its corresponding message and no bar.

## Out of Scope

- Historical usage breakdown (`/v2/team/credit-usage/historical`)
- Low-credit warnings elsewhere in the app (e.g. before starting a scrape)
- Any server-side/proxy involvement — this follows the existing BYOK direct-fetch pattern, not the `songbook-worker` proxy pattern used for first-party services
