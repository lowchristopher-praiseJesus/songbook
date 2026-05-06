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

// ── R2 fetching ────────────────────────────────────────────────────────────────
function makeS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function listAllR2Objects(s3) {
  const objects = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    for (const obj of res.Contents ?? []) objects.push(obj);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function fetchR2Stats() {
  const s3 = makeS3Client();
  const allObjects = await listAllR2Objects(s3);
  const totalBytes = allObjects.reduce((sum, o) => sum + (o.Size ?? 0), 0);

  const shareObjects = allObjects.filter(o => !o.Key.includes('/'));
  const albumMetaObjects = allObjects.filter(o =>
    /^albums\/[^/]+\/meta\.json$/.test(o.Key),
  );

  // HEAD each share to get expiresAt from R2 custom metadata (lowercased by SDK)
  const shares = await Promise.all(shareObjects.map(async (obj) => {
    try {
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      return {
        key: obj.Key,
        size: obj.Size ?? 0,
        createdAt: obj.LastModified?.toISOString() ?? null,
        expiresAt: head.Metadata?.expiresat ?? null,
      };
    } catch {
      return {
        key: obj.Key,
        size: obj.Size ?? 0,
        createdAt: obj.LastModified?.toISOString() ?? null,
        expiresAt: null,
      };
    }
  }));

  // Fetch meta.json for each album to get createdAt
  const albums = await Promise.all(albumMetaObjects.map(async (obj) => {
    try {
      const result = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      const text = await result.Body.transformToString();
      const meta = JSON.parse(text);
      return { albumCode: meta.albumCode, createdAt: meta.createdAt };
    } catch {
      return {
        albumCode: obj.Key.split('/')[1],
        createdAt: obj.LastModified?.toISOString() ?? null,
      };
    }
  }));

  return { shares, albums, totalBytes };
}

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
      try {
        const r2 = await fetchR2Stats();
        return Response.json({
          totalShares: r2.shares.length,
          totalAlbums: r2.albums.length,
          totalBytes: r2.totalBytes,
          sampleShare: r2.shares[0] ?? null,
          sampleAlbum: r2.albums[0] ?? null,
        });
      } catch (err) {
        console.error('R2 error:', err);
        return Response.json({ error: 'r2_unavailable' }, { status: 503 });
      }
    }
    return new Response('Not found', { status: 404 });
  },
});

const lanIp = Object.values(networkInterfaces()).flat()
  .find(i => i && !i.internal && i.family === 'IPv4')?.address ?? 'your-ip';
console.log(`Songbook Admin → http://localhost:${server.port}`);
console.log(`LAN access    → http://${lanIp}:${server.port}`);
