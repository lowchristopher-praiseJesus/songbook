# Security Vulnerability Report — SongSheet App

**Date:** 2026-05-07  
**Scope:** Full codebase review including Cloudflare Worker backend  
**Reviewer:** Claude (claude-sonnet-4-6)

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **Critical** | System integrity broken; exploitable by any anonymous user with minimal effort |
| **High** | Significant resource abuse, session takeover, or data corruption possible |
| **Medium** | Partial bypass, information disclosure, or elevated-impact abuse with preconditions |
| **Low** | Defense-in-depth gaps; low direct impact |

---

## Vulnerability Table

| # | Vulnerability | Location | Severity | Impact | Remediation |
|---|---------------|----------|----------|--------|-------------|
| 1 | **License secret hardcoded in client bundle** — `SECRET = 'songsheet-conductor-2026-v1'` and the full `encodePayload`/`computeChecksum` algorithm are exported from the JS module, shipped verbatim in the Vite bundle, and readable by anyone via DevTools | `src/lib/licenseValidation.js:3,132` | **Critical** | Any person can call `encodePayload` + `computeChecksum` in the browser console or via a build of the module to mint unlimited valid licence keys for any `expiresAt` and `licenseType` | Move licence validation to a server-side endpoint with a secret that never leaves the server; rotate the current secret immediately |
| 2 | **Licence gate is entirely client-side** — `isLicensed` is derived from `getLicenseStatus()` which runs only in-browser; nothing on the Cloudflare worker checks the licence | `src/contexts/LicenseContext.jsx` | **Critical** | Even without forging a key, any user can open DevTools and `localStorage.setItem('songsheet_conductor_license', '<valid_key>')` or patch the React context directly; no server ever verifies entitlement | Gate premium features behind a worker endpoint that validates the licence server-side before issuing a session/conductor token |
| 3 | **Client-supplied `conductorCode` allows session overwrite** — `/conductor/create` accepts a caller-chosen `conductorCode` and stores it under that key in KV; there is no uniqueness check | `songbook-worker/src/routes/conductor.ts:18,43-44` | **High** | An attacker who knows (or guesses) an active 6-character code can overwrite the KV record with a new `directorToken` of their choice, locking the real director out of their own broadcast and redirecting all followers to adversary-controlled content | The worker must generate `conductorCode` server-side (same pattern as session codes) and return it to the caller; never accept it from the client |
| 4 | **Client-supplied `directorToken` — zero entropy enforced** — the caller sends their own `directorToken` to `/conductor/create`; there is no minimum-length or entropy check | `songbook-worker/src/routes/conductor.ts:20-21` | **High** | A user can set `directorToken = "1"` or any guessable string; a second attacker who knows the `conductorCode` can try short tokens and take over director controls (`/start`, `/stop`, `/end`, `/current`) | Server must generate the `directorToken` with `crypto.randomUUID()` and return it to the creator; it must never be client-supplied |
| 5 | **No authentication or rate limiting on any worker endpoint** — the `VITE_WORKER_URL` is baked into the production JS bundle; every endpoint is unauthenticated and unbounded | `songbook-worker/src/index.ts` | **High** | An adversary can script thousands of requests per second: create unlimited sessions (30-day KV TTL each), upload unlimited shares (R2), create unlimited albums — exhausting both Cloudflare Workers CPU budget and R2 storage quota, causing billing spikes and service disruption for all users | Add Cloudflare Rate Limiting rules at the WAF layer (free tier supports basic rules); for writes, require a signed token or Turnstile CAPTCHA |
| 6 | **`applyOp` and session create accept unbounded `rawText`** — no size check is applied to `op.song.rawText` or to `songs[].rawText` in the create body before writing to KV | `songbook-worker/src/routes/session.ts:27-29,101-103` | **High** | A single malicious `add_song` op can store megabytes in a KV record; repeated ops bloat KV to its 25 MB per-value limit, corrupting the session for all participants and inflating KV storage costs | Enforce `rawText.length <= 100_000` (or reasonable max) and limit the `songs` array to e.g. 50 entries on both create and `add_song` |
| 7 | **ZIP bomb via share import** — `parseSbpFile` passes the fetched share `ArrayBuffer` directly to `JSZip.loadAsync()` with no decompression size limit; the upload endpoint only caps compressed size at 10 MB | `src/lib/parser/sbpParser.js:58-59`; `songbook-worker/src/routes/share.ts:14` | **High** | An attacker uploads a 9 MB ZIP bomb (e.g. a deeply nested store of zeroes that expands to several GB); any browser that imports that share URL runs JSZip's decompressor and exhausts tab memory/CPU, causing a browser crash or hang | After decompression, check that `text.length` (or total uncompressed bytes) does not exceed a sane limit (e.g. 5 MB) before parsing; consider `JSZip` options or streaming parsers that abort on excess size |
| 8 | **No size limit on album cover or audio track uploads** — the cover and track endpoints read the full request body with no Content-Length cap | `songbook-worker/src/routes/album.ts:98,153-156` | **High** | An attacker with a valid creator token (which requires only a prior album create) can upload arbitrarily large files, exhausting R2 storage and Cloudflare egress budget | Enforce a maximum body size (e.g. 50 MB for audio, 5 MB for cover) via `Content-Length` check before calling `arrayBuffer()` |
| 9 | **Cover image `Content-Type` stored and reflected without validation** — the caller-supplied `Content-Type` header is stored in R2 `httpMetadata` and returned verbatim to downstream clients | `songbook-worker/src/routes/album.ts:97,150-151`; `songbook-worker/src/lib/r2.ts:74,91` | **Medium** | If R2 serves objects from a domain that the SPA also trusts, an attacker can upload a cover with `Content-Type: text/html` containing a script, which a browser may execute when visiting the cover URL; even on a separate R2 domain, the stored MIME type is misleading | Validate the `Content-Type` header against an allowlist (`image/jpeg`, `image/png`, `image/webp`) and reject anything else; do not trust caller-supplied MIME for audio tracks either |
| 10 | **walkieShare endpoint has no size limit and no rate limiting** — the entire JSON body is written to R2 with no byte cap | `songbook-worker/src/routes/walkieShare.ts:7-33` | **Medium** | Any origin in `WALKIE_ORIGIN` can issue unlimited large uploads; the `volunteers`, `walkies`, and `liftCards` arrays can be arbitrarily nested or large, exhausting R2 storage | Add `Content-Length` or body-length guard (e.g. 1 MB max); apply rate limiting |
| 11 | **Session `clientId` is entirely caller-controlled** — edit lock acquisition and heartbeat renewal accept any `clientId` string from the request body | `songbook-worker/src/routes/session.ts:88,131` | **Medium** | A participant who learns another client's ID (e.g. from the public session state's `editLocks` records) can claim to be that client and steal or block their edit lock; in the conductor flow, a follower can impersonate another follower's heartbeats | Server should mint per-connection tokens and refuse lock operations from clients whose tokens don't match; at minimum, strip `clientId` from the public state response |
| 12 | **`conductorCode` and `sessionCode` path parameters are not format-validated** — any string Hono extracts from the URL path is passed directly to `kvKey()` | `songbook-worker/src/routes/conductor.ts:51`; `songbook-worker/src/routes/session.ts:56` | **Medium** | A very long or specially-crafted code (e.g. 500 chars) is concatenated into the KV key; while KV limits keys to 512 bytes, an oversized code could silently fail or expose error detail; also allows probing namespace boundaries by crafting codes that collide with known prefixes | Validate code format against a regex (e.g. `/^[A-Z2-9]{6}$/` for sessions, UUID for conductor codes) before any KV operation |
| 13 | **Firecrawl API key held client-side** — the key is stored somewhere accessible to page JavaScript (passed as `apiKey` parameter through the import UI) and sent in a client-side `Authorization` header | `src/lib/ugImport/firecrawlClient.js:8-15` | **Medium** | Any XSS vulnerability (e.g. in rendered song content) would allow script to read the stored API key and exfiltrate it; a leaked key can be abused for paid Firecrawl scraping at the owner's expense | Proxy Firecrawl requests through the Cloudflare Worker, storing the key as a worker secret; the browser never sees it |
| 14 | **`trackId` path parameter used as R2 key suffix without sanitisation** — `albums/${albumCode}/tracks/${trackId}` is constructed directly | `songbook-worker/src/lib/r2.ts:94` | **Low** | R2 treats keys as opaque strings, so `../` does not traverse directories, but a `trackId` containing the separator `albums/` or `/meta.json` suffix could overwrite the album metadata record for the same album if the prefix math happens to align | Validate `trackId` against a safe character set (alphanumeric, hyphens) before any R2 operation |
| 15 | **Album objects in R2 never expire** — unlike shares (which have `expiresAt` metadata) or KV entries (which have TTL), R2 album objects persist indefinitely | `songbook-worker/src/lib/r2.ts:48-56` | **Low** | Abandoned albums accumulate forever; combined with the unauthenticated create endpoint, an adversary can create thousands of albums and never delete them, growing R2 storage without bound | Add a Cloudflare R2 lifecycle rule or a periodic Worker cron that deletes albums older than N days; or require a creation token |
| 16 | **CORS middleware applies to all routes but `walkieShare` GET returns no CORS header on disallowed origins** — the GET handler in `walkieShare.ts` returns `{ 'Content-Type': 'application/json' }` only; the outer middleware adds `Access-Control-Allow-Origin` only when the origin is in the allowlist | `songbook-worker/src/routes/walkieShare.ts:44-47`; `songbook-worker/src/index.ts:36-39` | **Low** | If the walkie app is served from an origin not in `WALKIE_ORIGIN`, browsers block the response with a CORS error even though the data was fetched and the R2 read was charged; the error mode is silent | Document the required `WALKIE_ORIGIN` value and add a startup check; consider adding `Access-Control-Allow-Origin: *` to the walkie GET specifically if data is intentionally public |

---

## Priority Remediation Order

### Immediately
- **Rotate the `SECRET`** in `src/lib/licenseValidation.js` — it is already public in every built bundle that has shipped. Any licence key ever issued must be considered compromised.

### Before Next Release
- Make `conductorCode` and `directorToken` server-generated (issues #3, #4)
- Add input size guards on `rawText`, session song arrays, and walkieShare bodies (issues #6, #10)
- Validate path parameters (`conductorCode`, `sessionCode`, `trackId`) against safe regex (issues #12, #14)

### Before Production Scale
- Add Cloudflare WAF rate-limiting rules on all write endpoints: `/share/upload`, `/session/create`, `/conductor/create`, `/album` (issue #5)
- Add MIME type allowlisting for album cover and track uploads (issues #9)
- Enforce size caps on album cover (5 MB) and audio track (50 MB) uploads (issue #8)

### Near-Term
- Proxy the Firecrawl API key through the Cloudflare Worker as a secret (issue #13)
- Add decompression size guard in `parseSbpFile` after JSZip extracts content (issue #7)
- Add R2 lifecycle rules or a cron to expire abandoned albums (issue #15)

### Longer-Term
- Move licence validation entirely server-side; the client should receive a short-lived signed token from the worker after the worker validates the key (issues #1, #2)
- Mint server-side `clientId` tokens for session participants to prevent lock impersonation (issue #11)
