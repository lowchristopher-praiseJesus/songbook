export async function putShare(
  bucket: R2Bucket,
  shareCode: string,
  body: ArrayBuffer | Uint8Array | ReadableStream,
  expiresAt: Date,
  version = 1,
  locked = false,
): Promise<void> {
  await bucket.put(shareCode, body, {
    customMetadata: {
      expiresAt: expiresAt.toISOString(),
      version: String(version),
      locked: String(locked),
    },
    httpMetadata: { contentType: 'application/zip' },
  });
}

export async function headShare(
  bucket: R2Bucket,
  shareCode: string,
): Promise<
  { version: number; expiresAt: Date; locked: boolean } | { error: 'not_found' | 'expired' }
> {
  const head = await bucket.head(shareCode);
  if (!head) return { error: 'not_found' };

  const expiresAt = new Date(head.customMetadata?.expiresAt ?? '');
  if (isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    return { error: 'expired' };
  }

  return {
    version: Number(head.customMetadata?.version ?? 1),
    expiresAt,
    locked: head.customMetadata?.locked === 'true',
  };
}

export async function getShareIfValid(
  bucket: R2Bucket,
  shareCode: string,
): Promise<
  { object: R2ObjectBody; version: number; locked: boolean } | { error: 'not_found' | 'expired' }
> {
  const head = await headShare(bucket, shareCode);
  if ('error' in head) return head;

  const object = await bucket.get(shareCode);
  if (!object) return { error: 'not_found' };
  return { object, version: head.version, locked: head.locked };
}

// ── Album helpers ────────────────────────────────────────────────────────────

export interface AlbumMeta {
  albumCode: string;
  title: string;
  artist: string;
  createdAt: string;
  creatorToken: string;
  hasCover: boolean;
  coverExt: string;
  tracks: Array<{
    trackId: string;
    title: string;
    duration: number;
    mimeType: string;
  }>;
}

export async function putAlbumMeta(
  bucket: R2Bucket,
  albumCode: string,
  meta: AlbumMeta,
): Promise<void> {
  await bucket.put(`albums/${albumCode}/meta.json`, JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function getAlbumMetaRaw(
  bucket: R2Bucket,
  albumCode: string,
): Promise<AlbumMeta | null> {
  const obj = await bucket.get(`albums/${albumCode}/meta.json`);
  if (!obj) return null;
  return obj.json<AlbumMeta>();
}

export async function putAlbumCover(
  bucket: R2Bucket,
  albumCode: string,
  ext: string,
  body: ArrayBuffer | ReadableStream,
  contentType: string,
): Promise<void> {
  await bucket.put(`albums/${albumCode}/cover.${ext}`, body, {
    httpMetadata: { contentType },
  });
}

export async function getAlbumCover(
  bucket: R2Bucket,
  albumCode: string,
  ext: string,
): Promise<R2ObjectBody | null> {
  return bucket.get(`albums/${albumCode}/cover.${ext}`);
}

export async function putAlbumTrack(
  bucket: R2Bucket,
  albumCode: string,
  trackId: string,
  body: ArrayBuffer | ReadableStream,
  mimeType: string,
): Promise<void> {
  await bucket.put(`albums/${albumCode}/tracks/${trackId}`, body, {
    httpMetadata: { contentType: mimeType },
  });
}

export async function getAlbumTrack(
  bucket: R2Bucket,
  albumCode: string,
  trackId: string,
): Promise<R2ObjectBody | null> {
  return bucket.get(`albums/${albumCode}/tracks/${trackId}`);
}

export async function deleteAlbum(
  bucket: R2Bucket,
  albumCode: string,
): Promise<void> {
  const prefix = `albums/${albumCode}/`;
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 100 });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map(obj => bucket.delete(obj.key)));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
