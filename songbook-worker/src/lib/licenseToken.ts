const TOKEN_TTL_SECONDS = 24 * 60 * 60;

interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(str: string): Uint8Array {
  return Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

async function importKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signLicenseToken(
  licenseKey: string,
  secret: string,
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;
  const payload: TokenPayload = { sub: licenseKey, iat: now, exp };

  const payloadStr = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret, 'sign');
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));

  return {
    token: `${payloadStr}.${toBase64Url(new Uint8Array(sigBytes))}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function verifyLicenseToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;

  const payloadStr = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);

  try {
    const key = await importKey(secret, 'verify');
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigStr),
      new TextEncoder().encode(payloadStr),
    );
    if (!valid) return false;

    const payload: TokenPayload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadStr)),
    );
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
