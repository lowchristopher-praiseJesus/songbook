import { networkInterfaces } from 'node:os';
import { formatBytes, buildTimeline } from './lib.js';
import {
  S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';

const R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024;
const BUCKET = 'songbook-shares';
const CONDUCTOR_SESSION_DAYS = 30;

// ── Env validation ─────────────────────────────────────────────────────────────
const REQUIRED = [
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'CF_ACCOUNT_ID', 'CF_API_TOKEN', 'KV_NAMESPACE_ID',
];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[admin] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const env = {
  R2_ACCOUNT_ID:        process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  CF_ACCOUNT_ID:        process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN:         process.env.CF_API_TOKEN,
  KV_NAMESPACE_ID:      process.env.KV_NAMESPACE_ID,
};

// ── HTTP server ────────────────────────────────────────────────────────────────
const htmlFile = Bun.file(new URL('./index.html', import.meta.url).pathname);

const server = Bun.serve({
  port: 3001,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/') {
      return new Response(htmlFile, { headers: { 'Content-Type': 'text/html' } });
    }
    if (url.pathname === '/api/stats') {
      return Response.json({ ok: true, message: 'stats coming soon' });
    }
    return new Response('Not found', { status: 404 });
  },
});

const lanIp = Object.values(networkInterfaces()).flat()
  .find(i => i && !i.internal && i.family === 'IPv4')?.address ?? 'your-ip';
console.log(`Songbook Admin → http://localhost:${server.port}`);
console.log(`LAN access    → http://${lanIp}:${server.port}`);
