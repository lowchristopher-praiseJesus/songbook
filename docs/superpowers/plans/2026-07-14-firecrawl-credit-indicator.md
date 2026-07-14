# Firecrawl Credit Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show remaining Firecrawl credits (vs. plan total) in Settings, next to the existing Firecrawl API key field, refreshed on open and on key edits (debounced).

**Architecture:** A new `getCreditUsage(apiKey)` function in `src/lib/ugImport/firecrawlClient.js` calls Firecrawl's `GET /v2/team/credit-usage`. `SettingsPanel.jsx` holds a small `creditUsage` state machine (`idle`/`loading`/`success`/`error`) driven by a debounced `useEffect` keyed on the trimmed Firecrawl key, and renders a usage bar (success), a status line (error), or nothing (idle/loading text only).

**Tech Stack:** React 18, Vitest + @testing-library/react, existing `fetch`-based Firecrawl client pattern (no new dependencies).

## Global Constraints

- Firecrawl account endpoints are v2 (`https://api.firecrawl.dev/v2`), distinct from the existing v1 base used for `/search` and `/scrape`.
- Error normalization must reuse the existing convention in `firecrawlClient.js`: throw `new Error('NETWORK_ERROR')` / `new Error('UNAUTHORIZED')`, adding `new Error('NOT_FOUND')` for the new 404 case.
- No changes to how the Firecrawl key itself is stored or committed (`handleKeyChange` stays per-keystroke) — only the new credit-fetch effect is debounced.
- No bar is rendered on error — status line only, matching the license field's error-line convention.
- Reference spec: `docs/superpowers/specs/2026-07-14-firecrawl-credit-indicator-design.md`

---

### Task 1: `getCreditUsage` in `firecrawlClient.js`

**Files:**
- Modify: `src/lib/ugImport/firecrawlClient.js`
- Test: `src/lib/ugImport/__tests__/firecrawlClient.test.js`

**Interfaces:**
- Produces: `export async function getCreditUsage(apiKey)` — resolves to `{ remainingCredits: number, planCredits: number, billingPeriodStart: string|null, billingPeriodEnd: string|null }` on success; rejects with `Error('UNAUTHORIZED')` on HTTP 401, `Error('NOT_FOUND')` on HTTP 404, `Error('NETWORK_ERROR')` on any other non-2xx status or a rejected `fetch`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/ugImport/__tests__/firecrawlClient.test.js` (after the existing `scrapeURL` describe block, using the same `mockFetch` helper already defined at the top of the file):

```js
import { getCreditUsage } from '../firecrawlClient'
```

(add `getCreditUsage` to the existing `import { searchUG, scrapeURL } from '../firecrawlClient'` line at the top instead of a new import line)

```js
describe('getCreditUsage', () => {
  it('returns remainingCredits/planCredits/billingPeriod fields on success', async () => {
    mockFetch(200, {
      success: true,
      data: {
        remainingCredits: 400,
        planCredits: 1000,
        billingPeriodStart: '2026-07-01T00:00:00Z',
        billingPeriodEnd: '2026-07-31T23:59:59Z',
      },
    })
    const result = await getCreditUsage('my-api-key')
    expect(result).toEqual({
      remainingCredits: 400,
      planCredits: 1000,
      billingPeriodStart: '2026-07-01T00:00:00Z',
      billingPeriodEnd: '2026-07-31T23:59:59Z',
    })
  })

  it('sends a GET request to /v2/team/credit-usage with auth header', async () => {
    mockFetch(200, { success: true, data: { remainingCredits: 1, planCredits: 2, billingPeriodStart: null, billingPeriodEnd: null } })
    await getCreditUsage('my-api-key')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('https://api.firecrawl.dev/v2/team/credit-usage')
    expect(opts.headers['Authorization']).toBe('Bearer my-api-key')
    expect(opts.method ?? 'GET').toBe('GET')
  })

  it('throws UNAUTHORIZED on 401', async () => {
    mockFetch(401, {})
    await expect(getCreditUsage('bad-key')).rejects.toThrow('UNAUTHORIZED')
  })

  it('throws NOT_FOUND on 404', async () => {
    mockFetch(404, { success: false, error: 'Could not find credit usage information' })
    await expect(getCreditUsage('key')).rejects.toThrow('NOT_FOUND')
  })

  it('throws NETWORK_ERROR on 500', async () => {
    mockFetch(500, {})
    await expect(getCreditUsage('key')).rejects.toThrow('NETWORK_ERROR')
  })

  it('throws NETWORK_ERROR when fetch itself rejects', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(getCreditUsage('key')).rejects.toThrow('NETWORK_ERROR')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ugImport/__tests__/firecrawlClient.test.js`
Expected: FAIL — `getCreditUsage` is not exported / not a function.

- [ ] **Step 3: Implement `getCreditUsage`**

In `src/lib/ugImport/firecrawlClient.js`, add below the existing `FIRECRAWL_BASE` constant (line 1):

```js
const FIRECRAWL_V2_BASE = 'https://api.firecrawl.dev/v2'
```

Add this function after `firecrawlPost` (after line 25), before the `firecrawlSearch` export:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ugImport/__tests__/firecrawlClient.test.js`
Expected: PASS (all tests in the file, including the pre-existing `searchUG`/`scrapeURL` ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ugImport/firecrawlClient.js src/lib/ugImport/__tests__/firecrawlClient.test.js
git commit -m "feat: add getCreditUsage to Firecrawl client"
```

---

### Task 2: Credit usage display in `SettingsPanel.jsx`

**Files:**
- Modify: `src/components/Settings/SettingsPanel.jsx`
- Test: `src/components/Settings/__tests__/SettingsPanel.test.jsx`

**Interfaces:**
- Consumes: `getCreditUsage(apiKey)` from `../../lib/ugImport/firecrawlClient` (Task 1) — resolves `{ remainingCredits, planCredits, billingPeriodStart, billingPeriodEnd }`, rejects `Error('UNAUTHORIZED'|'NOT_FOUND'|'NETWORK_ERROR')`.
- Produces: a `data-testid="firecrawl-credit-bar"` element (rendered only in the `success` state) whose `style.width` is `((planCredits - remainingCredits) / planCredits) * 100` percent, clamped to 100.

- [ ] **Step 1: Write the failing tests**

Add this mock near the top of `src/components/Settings/__tests__/SettingsPanel.test.jsx`, alongside the existing `vi.mock('../../../lib/storage', ...)` block:

```js
// Mock firecrawlClient
const mockGetCreditUsage = vi.fn()
vi.mock('../../../lib/ugImport/firecrawlClient', () => ({
  getCreditUsage: (...args) => mockGetCreditUsage(...args),
}))
```

In the `beforeEach` block, reset it alongside the other mocks:

```js
mockGetCreditUsage.mockReset()
```

Add `vi.useFakeTimers()` in `beforeEach` and restore real timers in `afterEach`, so the existing `beforeEach`/`afterEach` become:

```js
beforeEach(() => {
  vi.useFakeTimers()
  onClose = vi.fn()
  mockTheme = 'light'
  mockIndex = []
  mockDeleteSong.mockReset()
  mockSetTheme.mockReset()
  mockSetFirecrawlKey.mockReset()
  mockGetFirecrawlKey = () => ''
  mockGetCreditUsage.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
```

Append a new describe block at the end of the file, before the final closing `})`:

```js
  // --- Firecrawl credit usage ---

  it('does not fetch credit usage when no key is present', async () => {
    mockGetFirecrawlKey = () => ''
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    expect(mockGetCreditUsage).not.toHaveBeenCalled()
  })

  it('shows "Checking credit balance…" while the fetch is pending', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    expect(screen.getByText('Checking credit balance…')).toBeInTheDocument()
  })

  it('renders the credit bar with correct width on success', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockResolvedValue({
      remainingCredits: 400,
      planCredits: 1000,
      billingPeriodStart: '2026-07-01T00:00:00Z',
      billingPeriodEnd: '2026-07-31T23:59:59Z',
    })
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByTestId('firecrawl-credit-bar')).toBeInTheDocument())
    const bar = screen.getByTestId('firecrawl-credit-bar')
    expect(bar.style.width).toBe('60%')
    expect(screen.getByText('400 / 1,000 credits remaining')).toBeInTheDocument()
  })

  it('shows "Invalid API key" and no bar on UNAUTHORIZED', async () => {
    mockGetFirecrawlKey = () => 'fc-badkey'
    mockGetCreditUsage.mockRejectedValue(new Error('UNAUTHORIZED'))
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByText('Invalid API key')).toBeInTheDocument())
    expect(screen.queryByTestId('firecrawl-credit-bar')).not.toBeInTheDocument()
  })

  it('shows "Credit usage not available for this key" on NOT_FOUND', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockRejectedValue(new Error('NOT_FOUND'))
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByText('Credit usage not available for this key')).toBeInTheDocument())
  })

  it('shows "Could not check credit balance" on NETWORK_ERROR', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockRejectedValue(new Error('NETWORK_ERROR'))
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByText('Could not check credit balance')).toBeInTheDocument())
  })

  it('debounces rapid key edits into a single fetch', async () => {
    mockGetFirecrawlKey = () => ''
    mockGetCreditUsage.mockResolvedValue({ remainingCredits: 1, planCredits: 2, billingPeriodStart: null, billingPeriodEnd: null })
    render(<SettingsPanel onClose={onClose} />)
    const input = screen.getByPlaceholderText('fc-…')
    fireEvent.change(input, { target: { value: 'fc-a' } })
    await vi.advanceTimersByTimeAsync(200)
    fireEvent.change(input, { target: { value: 'fc-ab' } })
    await vi.advanceTimersByTimeAsync(200)
    fireEvent.change(input, { target: { value: 'fc-abc' } })
    await vi.advanceTimersByTimeAsync(600)
    expect(mockGetCreditUsage).toHaveBeenCalledTimes(1)
    expect(mockGetCreditUsage).toHaveBeenCalledWith('fc-abc')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/Settings/__tests__/SettingsPanel.test.jsx`
Expected: FAIL — no `firecrawl-credit-bar` testid, no "Checking credit balance…" text, etc. (component doesn't fetch or render credit usage yet)

- [ ] **Step 3: Implement the state, effect, and display block**

In `src/components/Settings/SettingsPanel.jsx`, update the import line at the top (line 2) to add `useRef`:

```js
import { useEffect, useRef, useState } from 'react'
```

Add an import for `getCreditUsage` (near line 6, alongside the storage import):

```js
import { getCreditUsage } from '../../lib/ugImport/firecrawlClient'
```

After the existing `const [showKey, setShowKey] = useState(false)` line (line 17), add:

```js
  const [creditUsage, setCreditUsage] = useState({ status: 'idle', data: null, error: null })
  const creditsTimerRef = useRef(null)
```

After the existing Escape-key `useEffect` (lines 45-51), add a new effect:

```js
  useEffect(() => {
    const trimmed = firecrawlKey.trim()
    clearTimeout(creditsTimerRef.current)
    if (!trimmed) {
      setCreditUsage({ status: 'idle', data: null, error: null })
      return
    }
    creditsTimerRef.current = setTimeout(() => {
      setCreditUsage({ status: 'loading', data: null, error: null })
      getCreditUsage(trimmed)
        .then(data => setCreditUsage({ status: 'success', data, error: null }))
        .catch(err => setCreditUsage({ status: 'error', data: null, error: err.message }))
    }, 600)
    return () => clearTimeout(creditsTimerRef.current)
  }, [firecrawlKey])
```

Replace the closing `</div>` of the Firecrawl API Key block (the `<p className="mt-1 text-xs text-gray-400">...</p>` block ending at line 185, just before its enclosing `</div>` at line 186) by inserting the new display block right after that `<p>` and before the `</div>`:

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/Settings/__tests__/SettingsPanel.test.jsx`
Expected: PASS (all tests in the file, including all pre-existing ones)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (no regressions in other test files)

- [ ] **Step 6: Commit**

```bash
git add src/components/Settings/SettingsPanel.jsx src/components/Settings/__tests__/SettingsPanel.test.jsx
git commit -m "feat: show Firecrawl credit balance in Settings"
```

---

## Self-Review Notes

- **Spec coverage:** Goal 1 (show remaining credits) → Task 2 success-state bar. Goal 2 (refresh on open + debounced on edit) → Task 2's single `useEffect` keyed on `firecrawlKey`, debounced 600ms, which fires once on mount and once per settled edit. Goal 3 (graceful degradation) → Task 2's three error-message branches, backed by Task 1's `UNAUTHORIZED`/`NOT_FOUND`/`NETWORK_ERROR` normalization.
- **Type consistency:** `getCreditUsage` (Task 1) return shape `{ remainingCredits, planCredits, billingPeriodStart, billingPeriodEnd }` matches exactly what Task 2 reads off `creditUsage.data`. Error message strings (`'UNAUTHORIZED'`, `'NOT_FOUND'`, `'NETWORK_ERROR'`) match between the thrown `Error` in Task 1 and the `creditUsage.error` checks in Task 2.
- **Out of scope confirmed:** no historical usage endpoint, no low-credit warnings elsewhere, no worker/proxy involvement — matches the spec's Non-Goals.
