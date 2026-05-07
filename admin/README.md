# Songbook Admin Dashboard

LAN-only admin dashboard for monitoring Songbook shares, albums, sessions, and R2 storage.

## Prerequisites

- [Bun](https://bun.sh) runtime

## Setup

1. Copy `.env.example` to `.env` and fill in credentials:

   ```
   cp .env.example .env
   ```

2. Required environment variables:

   | Variable | Description |
   |---|---|
   | `R2_ACCOUNT_ID` | Cloudflare account ID |
   | `R2_ACCESS_KEY_ID` | R2 access key |
   | `R2_SECRET_ACCESS_KEY` | R2 secret key |
   | `CF_ACCOUNT_ID` | Cloudflare account ID (same as R2) |
   | `CF_API_TOKEN` | CF API token with KV read permissions |
   | `KV_NAMESPACE_ID` | KV namespace ID for songbook data |

3. Install dependencies:

   ```
   bun install
   ```

## Running

```
bun run server.js
```

Open [http://localhost:3001](http://localhost:3001) in a browser.

## Features

- **Stat cards** — total shares, active shares, albums, sessions (last 30d), conductors (last 30d), R2 storage used
- **Creation timeline** — monthly/weekly chart of shares, albums, sessions, conductors created over time
- **R2 storage donut** — visual breakdown of used vs free tier storage with percentage label

## Development

Run unit tests:

```
bun test
```

## Notes

- Sessions and conductors are stored in KV with a 30-day TTL. Only items created in the last ~30 days appear in the timeline.
- The dashboard is LAN-only — no authentication. Do not expose port 3001 to the internet.
- R2 storage is compared against the 10 GB free tier limit.
