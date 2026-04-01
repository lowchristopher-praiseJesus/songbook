export async function putShare(
  bucket: R2Bucket,
  shareCode: string,
  body: ArrayBuffer | Uint8Array | ReadableStream,
  expiresAt: Date,
): Promise<void> {
  await bucket.put(shareCode, body, {
    customMetadata: { expiresAt: expiresAt.toISOString() },
    httpMetadata: { contentType: 'application/zip' },
  });
}

export async function getShareIfValid(
  bucket: R2Bucket,
  shareCode: string,
): Promise<{ object: R2ObjectBody } | { error: 'not_found' | 'expired' }> {
  const head = await bucket.head(shareCode);
  if (!head) return { error: 'not_found' };

  const expiresAt = new Date(head.customMetadata?.expiresAt ?? '');
  if (isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    return { error: 'expired' };
  }

  const object = await bucket.get(shareCode);
  if (!object) return { error: 'not_found' };
  return { object };
}
