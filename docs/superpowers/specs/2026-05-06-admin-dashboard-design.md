# Admin Dashboard Design

**Date:** 2026-05-06  
**Status:** Approved

## Overview

A locally-served admin dashboard for monitoring Songbook app usage — share links created, albums published, live sessions started, and conductor broadcasts — alongside Cloudflare R2 storage consumption vs the free-tier limit. Accessible on the LAN from any device. No changes to the deployed Cloudflare Worker.

---

## Goals

- Track how many shares, albums, live sessions, and conductor broadcasts are being created over time
- Monitor total R2 storage used vs the 10 GB free tier (capacity planning)
- LAN-only access — no public exposure required
- Zero build step for the UI; start with a single `bun server.js` command

---

## Architecture

### Files

```
admin/
  server.js       # Bun HTTP server (~100 lines)
  index.html      # Self-contained dashboard UI (Chart.js via CDN)
  .env            # R2 + Cloudflare credentials (gitignored)
  .env.example    # Placeholder template (committed)
  README.md       # Setup: get tokens, bun server.js, open URL
```

`.gitignore` addition: `admin/.env`

### Runtime

```bash
bun admin/server.js
# → http://localhost:3001  (LAN: http://{mac-ip}:3001)
```

Server binds to `0.0.0.0` so any device on the LAN can reach the dashboard.

### Server Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Serves `index.html` |
| `GET /api/stats` | Aggregates data from R2 + KV, returns JSON |
| `GET /api/stats?granularity=weekly` | Same, but timeline bucketed by week |

---

## Data Sources

### 1. R2 (Shares + Albums)

Access method: `@aws-sdk/client-s3` pointed at Cloudflare's S3-compatible R2 endpoint.

**Shares** — flat UUID keys (no `/` in key, not under `albums/`):
- Creation time: R2 object `uploaded` timestamp
- Expiry: `customMetadata.expiresAt`
- Active = `expiresAt` is in the future

**Albums** — keys under `albums/*/meta.json`:
- Creation time: `meta.json → createdAt`
- Storage: sum of all objects under `albums/{albumCode}/` (meta + cover + tracks)

**Total storage**: sum of `.size` across all R2 objects.

Required credentials in `.env`:
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

R2 S3-compatible endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`  
Bucket name: `songbook-shares`

### 2. SESSION_KV (Sessions + Conductors)

Access method: Cloudflare REST API (`fetch` with `Authorization: Bearer {CF_API_TOKEN}`).

**KV key prefixes:**

| Prefix | Type | createdAt source |
|---|---|---|
| `session:{6-char code}` | `SessionData` | `data.createdAt` (explicit field) |
| `conductor:{6-char code}` | `ConductorData` | inferred: `new Date(data.expiresAt) − 30 days` |

**Session fields used:** `createdAt`, `expiresAt`, `closed`  
**Active session** = `!closed && expiresAt > now` (matches `isSessionDead` logic in worker)

**Conductor fields used:** `expiresAt`, `live`, `terminated`, `followers` (for active follower count)  
**Active conductor** = `!terminated && expiresAt > now` (matches `isConductorExpired`/`isConductorTerminated` logic in worker)

**Important limitation:** KV entries auto-expire after their 30-day TTL. Sessions and conductors older than 30 days are no longer accessible via KV list. The dashboard therefore reflects only the rolling last ~30 days for these two series.

Required credentials in `.env`:
```
CF_ACCOUNT_ID=
CF_API_TOKEN=          # KV:Read permission required
KV_NAMESPACE_ID=4db84560ebae40cf90fb142ee84c8562
```

KV list endpoint: `https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{KV_NAMESPACE_ID}/keys`

---

## API Response Shape

```json
{
  "summary": {
    "totalShares": 42,
    "activeShares": 31,
    "totalAlbums": 8,
    "totalBytes": 182400000,
    "r2FreeTierBytes": 10737418240,
    "totalSessions": 15,
    "activeSessions": 5,
    "totalConductors": 8,
    "activeConductors": 2
  },
  "timeline": [
    { "date": "2026-04", "shares": 12, "albums": 3, "sessions": 4, "conductors": 2 },
    { "date": "2026-05", "shares": 30, "albums": 5, "sessions": 11, "conductors": 6 }
  ],
  "fetchedAt": "2026-05-06T09:00:00.000Z"
}
```

`date` format is `YYYY-MM` for monthly granularity, `YYYY-Www` for weekly.

---

## Dashboard UI (`index.html`)

### Layout: Stats Row + 2-Column Charts

```
┌─────────────────────────────────────────────────────────┐
│  Songbook Admin                          [Refresh]  [ts] │
├────────┬────────┬────────┬─────────┬──────────┬─────────┤
│ Shares │ Active │ Albums │Sessions │Conductors│  R2 Used │
├──────────────────────────────────────┬──────────────────┤
│                                      │                  │
│   Multi-line timeline chart          │  Storage donut   │
│   (Chart.js, monthly/weekly toggle)  │  (Chart.js)      │
│                                      │                  │
└──────────────────────────────────────┴──────────────────┘
```

### Stat Cards (6 cards, top row)

| Card | Value | Colour |
|---|---|---|
| Shares | `totalShares` | Blue |
| Active Shares | `activeShares` | Green |
| Albums | `totalAlbums` | Purple |
| Sessions | `totalSessions` | Orange |
| Conductors | `totalConductors` | Red/Pink |
| R2 Used | human-readable bytes | Sky blue |

### Timeline Chart (left column, ~65% width)

- **Type:** Multi-line (Chart.js `line`)
- **Series:** Shares (blue), Albums (purple), Sessions (orange), Conductors (red)
- **X axis:** date buckets from `timeline` array
- **Toggle:** Monthly / Weekly switcher re-fetches with `?granularity=weekly`

### Storage Panel (right column, ~35% width)

- **Type:** Donut (Chart.js `doughnut`)
- **Segments:** Used (blue) vs Free (light grey)
- **Centre label:** Percentage used (e.g. "2%")
- **Below donut:** `174 MB of 10 GB used` text + thin progress bar

### Refresh Behaviour

- "Refresh" button triggers `GET /api/stats`, shows a spinner on the button during fetch
- Last-fetched timestamp displayed next to the button
- On error: non-fatal banner below header, previously loaded data stays visible

---

## Data Flow (per refresh)

1. `index.html` → `GET /api/stats` → Bun server
2. Server fires two parallel async operations:
   - **R2 list**: `ListObjectsV2` (paginated), separates shares from albums, fetches album `meta.json` files in parallel, sums sizes
   - **KV list**: lists `session:*` keys, then `conductor:*` keys via CF REST API; fetches each value in parallel
3. Server groups all events by month (or week) into the `timeline` array
4. Returns combined JSON; server adds `fetchedAt` timestamp
5. `index.html` updates stat cards, redraws both Chart.js charts

---

## Error Handling

| Failure | Behaviour |
|---|---|
| Missing `.env` var at startup | Server logs which var is missing and exits — does not start |
| R2 list fails | `/api/stats` returns `{ error: "r2_unavailable" }`, UI shows banner, keeps prior data |
| KV list/fetch fails | KV stats show `—`, R2 stats still render, banner shown |
| Individual album `meta.json` fetch fails | Album counted in total, excluded from timeline |
| Network timeout | Both R2 and KV requests have a 15-second timeout via `AbortController` |

---

## Setup (README summary)

1. Create an R2 API token in the Cloudflare dashboard (Object Read permission on `songbook-shares` bucket)
2. Create a Cloudflare API token with **Workers KV Storage:Read** permission
3. `cp admin/.env.example admin/.env` and fill in values
4. `bun admin/server.js`
5. Open `http://localhost:3001` (or `http://{lan-ip}:3001` from another device)

---

## Out of Scope

- Authentication / login (LAN-only, trusted network assumed)
- Write operations (delete shares, etc.)
- Historical data older than 30 days for sessions/conductors (KV TTL limitation)
- Alerting or notifications
- Tracking share deletions/expirations over time (R2 list only shows currently stored objects)
