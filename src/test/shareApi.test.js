import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadShare, fetchShare, checkShareVersion, updateShare, setShareLocked } from '../lib/shareApi';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('uploadShare', () => {
  it('POSTs blob with correct headers and returns JSON', async () => {
    const mockResult = {
      shareCode: 'abc-123',
      shareUrl: 'http://app?share=abc-123',
      expiresAt: '2026-04-08T00:00:00.000Z',
    };
    fetch.mockResolvedValue({ ok: true, json: async () => mockResult });

    const blob = new Blob(['zip-data'], { type: 'application/zip' });
    const result = await uploadShare(blob, 14, 'test-turnstile-token');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/upload'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/zip',
          'X-Expires-In-Days': '14',
          'X-Turnstile-Token': 'test-turnstile-token',
        }),
        body: blob,
      }),
    );
    expect(result).toEqual(mockResult);
  });

  it('uses 7 as default expiresInDays', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), undefined, 'tok');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Expires-In-Days': '7' }),
      }),
    );
  });

  it('throws with code upload_failed on non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false });
    await expect(uploadShare(new Blob(['x']), 7)).rejects.toMatchObject({
      code: 'upload_failed',
    });
  });

  it('sends X-Locked: false by default', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), 7, 'tok');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Locked': 'false' }),
      }),
    );
  });

  it('sends X-Locked: true when locked is passed', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), 7, 'tok', true);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Locked': 'true' }),
      }),
    );
  });
});

describe('fetchShare', () => {
  it('returns ArrayBuffer on 200', async () => {
    const buf = new ArrayBuffer(4);
    fetch.mockResolvedValue({ status: 200, ok: true, arrayBuffer: async () => buf });
    const result = await fetchShare('abc123');
    expect(result).toBe(buf);
  });

  it('bypasses HTTP cache with cache: no-store', async () => {
    fetch.mockResolvedValue({ status: 200, ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    await fetchShare('abc123');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/abc123'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('throws with code not_found on 404', async () => {
    fetch.mockResolvedValue({ status: 404, ok: false });
    await expect(fetchShare('abc')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws with code expired on 410', async () => {
    fetch.mockResolvedValue({ status: 410, ok: false });
    await expect(fetchShare('abc')).rejects.toMatchObject({ code: 'expired' });
  });

  it('throws with code network_error on other failure', async () => {
    fetch.mockResolvedValue({ status: 500, ok: false });
    await expect(fetchShare('abc')).rejects.toMatchObject({ code: 'network_error' });
  });
});

describe('checkShareVersion', () => {
  it('returns { version } from X-Share-Version header on 200', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: (h) => h === 'X-Share-Version' ? '3' : null },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 3, locked: false });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/abc-123'),
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' }),
    );
  });

  it('throws with code expired on 410', async () => {
    fetch.mockResolvedValue({ status: 410, ok: false, headers: { get: () => null } });
    await expect(checkShareVersion('abc')).rejects.toMatchObject({ code: 'expired' });
  });

  it('throws with code not_found on 404', async () => {
    fetch.mockResolvedValue({ status: 404, ok: false, headers: { get: () => null } });
    await expect(checkShareVersion('abc')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('defaults to version 1 when X-Share-Version header is absent', async () => {
    fetch.mockResolvedValue({ status: 200, ok: true, headers: { get: () => null }, text: async () => '' });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 1, locked: false });
  });

  it('returns locked: true from X-Share-Locked header', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: (h) => (h === 'X-Share-Version' ? '3' : h === 'X-Share-Locked' ? 'true' : null) },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 3, locked: true });
  });

  it('defaults locked to false when X-Share-Locked header is absent', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 1, locked: false });
  });
});

describe('updateShare', () => {
  it('PUTs blob to /share/{shareCode} and returns { version, updatedAt }', async () => {
    const mockResult = { version: 2, updatedAt: '2026-06-04T10:00:00.000Z' };
    fetch.mockResolvedValue({ ok: true, json: async () => mockResult });
    const blob = new Blob(['zip'], { type: 'application/zip' });
    const result = await updateShare('abc-123', blob);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/abc-123'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'Content-Type': 'application/zip' }),
        body: blob,
      }),
    );
    expect(result).toEqual(mockResult);
  });

  it('throws with code update_failed on non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false });
    await expect(updateShare('abc', new Blob(['x']))).rejects.toMatchObject({ code: 'update_failed' });
  });

  it('throws with code not_found on 404', async () => {
    fetch.mockResolvedValue({ status: 404, ok: false });
    await expect(updateShare('abc', new Blob(['x']))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws with code expired on 410', async () => {
    fetch.mockResolvedValue({ status: 410, ok: false });
    await expect(updateShare('abc', new Blob(['x']))).rejects.toMatchObject({ code: 'expired' });
  });

  it('throws with code locked on 423', async () => {
    fetch.mockResolvedValue({ status: 423, ok: false });
    await expect(updateShare('abc', new Blob(['x']))).rejects.toMatchObject({ code: 'locked' });
  });
});

describe('setShareLocked', () => {
  it('PATCHes /share/{shareCode}/lock with JSON body and returns { locked }', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ locked: true }) });
    const result = await setShareLocked('abc-123', true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/abc-123/lock'),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ locked: true }),
      }),
    );
    expect(result).toEqual({ locked: true });
  });

  it('throws with code not_found on 404', async () => {
    fetch.mockResolvedValue({ status: 404, ok: false });
    await expect(setShareLocked('abc', true)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws with code expired on 410', async () => {
    fetch.mockResolvedValue({ status: 410, ok: false });
    await expect(setShareLocked('abc', true)).rejects.toMatchObject({ code: 'expired' });
  });

  it('throws with code lock_failed on other failure', async () => {
    fetch.mockResolvedValue({ status: 500, ok: false });
    await expect(setShareLocked('abc', true)).rejects.toMatchObject({ code: 'lock_failed' });
  });
});
