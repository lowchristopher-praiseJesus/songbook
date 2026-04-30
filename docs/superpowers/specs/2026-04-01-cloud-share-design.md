# Cloud Share Design

**Date:** 2026-04-01
**Status:** Approved

## Context

The app currently supports exporting songs as a local `.sbp` file download. Users in group settings (worship teams, bands) need a frictionless way to share song lists with others — ideally a single URL that recipients can click to import the songs directly. Since this is a client-side-only app, a lightweight backend is needed solely to broker access to Cloudflare R2 cloud storage. No credentials should ever reach the browser.

## Architecture

Two pieces: a Cloudflare Worker (backend) and changes to the React SPA (frontend).

```
Browser (React SPA)
    │
    │  POST /share/upload  (raw .sbp blob + X-Expires-In-Days header)
    │  GET  /share/:code   (download .sbp blob)
    │
    ▼
Cloudflare Worker (Hono)
    │  Native R2 binding — no AWS SDK, no presigned URLs
    │
    ▼
Cloudflare R2
    Object key  = shareCode (UUID v4)
    customMetadata = { expiresAt: ISO timestamp }
```

The Worker uses a native R2 bucket binding to read and write objects directly — no credentials are required in code or environment variables beyond `APP_ORIGIN` (used for CORS).

## Backend — Cloudflare Worker (Hono)

**Repository:** separate folder `songbook-worker/` (or a new repo), deployed via `wrangler deploy`.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/share/upload` | Accept .sbp blob, write to R2, return shareCode + shareUrl |
| GET | `/share/:code` | Check expiry, stream .sbp blob to client |
| GET | `/health` | Health check |

### POST `/share/upload`

- Request: raw binary body (`.sbp` blob), header `X-Expires-In-Days: 7` (clamped to 1–30, default 7)
- Worker generates a UUID v4 as `shareCode`
- Writes to R2: `bucket.put(shareCode, body, { customMetadata: { expiresAt }, httpMetadata: { contentType: 'application/zip' } })`
- Response: `{ shareCode, shareUrl, expiresAt }`

### GET `/share/:code`

- Worker calls `bucket.head(shareCode)` to read `customMetadata.expiresAt`
- If object not found → 404 `{ error: "not_found" }`
- If `expiresAt` is in the past → 410 `{ error: "expired" }`
- Otherwise → `bucket.get(shareCode)`, stream body to client with `Content-Type: application/zip`

### `wrangler.toml`

```toml
name = "songbook-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "songbook-shares"
```

### Environment variables

```
APP_ORIGIN   # e.g. https://yourapp.netlify.app
```

CORS: `Access-Control-Allow-Origin` is set to `APP_ORIGIN` only. All other origins receive a 403.

Local dev: `wrangler dev` — set `APP_ORIGIN=http://localhost:5173` in `.dev.vars`.

## Frontend — React SPA Changes

### 1. Export modal — choice screen

The existing export filename modal is replaced with a two-step choice modal:

**Step 1 — Choose export type:**
```
Export 5 songs
[ ↓ Download .sbp ]
[ 🔗 Share via link ]
```

- "Download .sbp" → existing filename prompt → local download (unchanged behaviour)
- "Share via link" → Step 2

**Step 2 — Share options + upload:**
- Expiry picker: default 7 days, range 1–30 (slider or select)
- "Create link" button → uploads blob → shows share URL with copy button
- Upload progress indicator while Worker processes the request

### 2. URL detection on app load

`App.jsx` checks `window.location.search` for `?share=<uuid>` on mount (no React Router needed — plain `URLSearchParams`). If found:
1. Fetches `GET /share/:code` from the Worker
2. Parses the `.sbp` blob using existing `parseSbpFile()`
3. Opens the import confirmation modal

### 3. Import confirmation modal

Shown when a `?share=` param is detected:

```
Shared Songbook
5 songs shared with you:
• El Shaddai
• How Great Thou Art
• ...

[ Import All ]   [ Cancel ]
```

- "Import All" → calls existing `addSongs()` + existing duplicate-resolution flow
- "Cancel" → `history.replaceState` strips `?share=` from URL, modal dismissed, no import

### New / modified files

| File | Change |
|------|--------|
| `src/components/Sidebar/Sidebar.jsx` | Replace export modal with choice modal |
| `src/App.jsx` | Add `?share=` URL param detection on mount |
| `src/lib/shareApi.js` | New — `uploadShare(blob, expiresInDays)` and `fetchShare(code)` |
| `src/components/Share/ShareModal.jsx` | New — upload progress + share URL display |
| `src/components/Share/ImportConfirmModal.jsx` | New — confirmation screen for recipients |

### `shareApi.js` interface

```js
// Upload selected songs as .sbp to R2 via Worker
// Returns { shareCode, shareUrl, expiresAt }
export async function uploadShare(blob, expiresInDays = 7) { ... }

// Fetch .sbp blob for a given share code
// Throws { code: 'not_found' | 'expired' | 'network_error' }
export async function fetchShare(shareCode) { ... }
```

The `VITE_WORKER_URL` environment variable points to the Worker origin (e.g. `https://songbook-worker.your-subdomain.workers.dev`).

## Error Handling

| Scenario | Handling |
|----------|----------|
| Upload fails (network) | ShareModal shows error + retry button |
| Share code not found | App shows "This link was not found" |
| Share link expired | App shows "This link has expired" |
| Recipient cancels import | URL cleaned up via `history.replaceState`, no songs imported |
| Duplicate songs | Existing duplicate-resolution modal (replace / keep-both / skip) |
| Worker CORS rejection | Non-`APP_ORIGIN` requests receive 403 |

## Verification

1. **Upload flow:** Select songs → Share via link → set expiry → Create link. Confirm Worker returns `shareCode`, R2 object exists with correct `customMetadata.expiresAt`.
2. **Download flow:** Open `?share=<uuid>` in a fresh browser tab → confirmation modal appears with correct song titles.
3. **Expiry enforcement:** In Worker unit test, mock `Date.now()` past `expiresAt` → GET returns 410.
4. **Duplicate handling:** Share a song already in the library → duplicate-resolution modal appears.
5. **Cancel:** Recipient opens share URL, cancels → `?share=` stripped from URL, library unchanged.
6. **Local dev:** `wrangler dev` + `vite dev` with `APP_ORIGIN=http://localhost:5173` and `VITE_WORKER_URL=http://localhost:8787`.
