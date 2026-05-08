import { Hono } from 'hono';
import type { Env } from '../types';
import {
  AlbumMeta,
  deleteAlbum,
  getAlbumCover,
  getAlbumMetaRaw,
  getAlbumTrack,
  putAlbumCover,
  putAlbumMeta,
  putAlbumTrack,
} from '../lib/r2';

const album = new Hono<{ Bindings: Env }>();

// Albums are public — always allow any origin on all album responses.
const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Creator-Token',
};

album.options('*', (c) =>
  new Response(null, { status: 204, headers: PUBLIC_CORS }),
);

// POST /album — create album (metadata + optional cover)
album.post('/', async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const metaRaw = formData.get('meta');
  if (typeof metaRaw !== 'string') return c.json({ error: 'missing_meta' }, 400);

  let parsed: Omit<AlbumMeta, 'albumCode' | 'creatorToken' | 'createdAt'>;
  try {
    parsed = JSON.parse(metaRaw);
  } catch {
    return c.json({ error: 'invalid_meta' }, 400);
  }

  if (!parsed.title || !Array.isArray(parsed.tracks)) {
    return c.json({ error: 'invalid_meta' }, 400);
  }

  const albumCode = crypto.randomUUID();
  const creatorToken = crypto.randomUUID();

  const coverFile = formData.get('cover');
  let hasCover = false;
  let coverExt = '';

  if (coverFile !== null && typeof coverFile === 'object' && 'arrayBuffer' in coverFile) {
    const blob = coverFile as Blob;
    if (blob.size > 0) {
      if (blob.size > 5 * 1024 * 1024) {
        return c.json({ error: 'cover_too_large' }, 413);
      }
      const mime = blob.type || 'image/jpeg';
      coverExt = mime.includes('png') ? 'png' : 'jpg';
      const buf = await blob.arrayBuffer();
      await putAlbumCover(c.env.R2_BUCKET, albumCode, coverExt, buf, mime);
      hasCover = true;
    }
  }

  const meta: AlbumMeta = {
    albumCode,
    title: parsed.title,
    artist: parsed.artist ?? '',
    createdAt: new Date().toISOString(),
    creatorToken,
    hasCover,
    coverExt,
    tracks: parsed.tracks,
  };
  await putAlbumMeta(c.env.R2_BUCKET, albumCode, meta);

  return new Response(JSON.stringify({ albumCode, creatorToken }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});

// POST /album/:code/track/:trackId — upload one audio track
album.post('/:code/track/:trackId', async (c) => {
  const { code, trackId } = c.req.param();
  const creatorToken = c.req.header('X-Creator-Token');

  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, code);
  if (!meta) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  if (meta.creatorToken !== creatorToken) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: PUBLIC_CORS });
  }

  const mimeType = c.req.header('Content-Type') ?? 'audio/webm';
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    return new Response(JSON.stringify({ error: 'no_body' }), { status: 400, headers: PUBLIC_CORS });
  }

  await putAlbumTrack(c.env.R2_BUCKET, code, trackId, body, mimeType);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});

// PATCH /album/:code — update metadata (title, artist, tracks)
album.patch('/:code', async (c) => {
  const { code } = c.req.param();
  const creatorToken = c.req.header('X-Creator-Token');

  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, code);
  if (!meta) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  if (meta.creatorToken !== creatorToken) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: PUBLIC_CORS });
  }

  let body: { title?: string; artist?: string; tracks?: AlbumMeta['tracks'] };
  try {
    body = await c.req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400, headers: PUBLIC_CORS });
  }

  const updated: AlbumMeta = {
    ...meta,
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.artist !== undefined ? { artist: body.artist } : {}),
    ...(body.tracks !== undefined ? { tracks: body.tracks } : {}),
  };
  await putAlbumMeta(c.env.R2_BUCKET, code, updated);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});

// POST /album/:code/cover — replace cover image
album.post('/:code/cover', async (c) => {
  const { code } = c.req.param();
  const creatorToken = c.req.header('X-Creator-Token');

  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, code);
  if (!meta) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  if (meta.creatorToken !== creatorToken) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: PUBLIC_CORS });
  }

  const mime = c.req.header('Content-Type') ?? 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0) {
    return new Response(JSON.stringify({ error: 'no_body' }), { status: 400, headers: PUBLIC_CORS });
  }

  await putAlbumCover(c.env.R2_BUCKET, code, ext, buf, mime);
  await putAlbumMeta(c.env.R2_BUCKET, code, { ...meta, hasCover: true, coverExt: ext });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});

// GET /album/:code — return public metadata (creatorToken stripped)
album.get('/:code', async (c) => {
  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, c.req.param('code'));
  if (!meta) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  }

  const { creatorToken: _stripped, ...publicMeta } = meta;
  return new Response(JSON.stringify(publicMeta), {
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});

// GET /album/:code/cover — stream cover art
album.get('/:code/cover', async (c) => {
  const { code } = c.req.param();
  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, code);
  if (!meta || !meta.hasCover) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  }

  const obj = await getAlbumCover(c.env.R2_BUCKET, code, meta.coverExt);
  if (!obj) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...PUBLIC_CORS,
    },
  });
});

// GET /album/:code/track/:trackId — stream audio
album.get('/:code/track/:trackId', async (c) => {
  const { code, trackId } = c.req.param();
  const obj = await getAlbumTrack(c.env.R2_BUCKET, code, trackId);
  if (!obj) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  }

  const headers: Record<string, string> = {
    'Content-Type': obj.httpMetadata?.contentType ?? 'audio/webm',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ...PUBLIC_CORS,
  };
  if (obj.size) headers['Content-Length'] = String(obj.size);

  return new Response(obj.body, { headers });
});

// DELETE /album/:code — delete all album objects
album.delete('/:code', async (c) => {
  const { code } = c.req.param();
  const creatorToken = c.req.header('X-Creator-Token');

  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, code);
  if (!meta) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  if (meta.creatorToken !== creatorToken) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: PUBLIC_CORS });
  }

  await deleteAlbum(c.env.R2_BUCKET, code);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});

export default album;
