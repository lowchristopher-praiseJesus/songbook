import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadShare, fetchShare } from '../lib/shareApi';

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
    const result = await uploadShare(blob, 14);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/upload'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/zip',
          'X-Expires-In-Days': '14',
        }),
        body: blob,
      }),
    );
    expect(result).toEqual(mockResult);
  });

  it('uses 7 as default expiresInDays', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']));
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
});

describe('fetchShare', () => {
  it('returns ArrayBuffer on 200', async () => {
    const buf = new ArrayBuffer(4);
    fetch.mockResolvedValue({ status: 200, ok: true, arrayBuffer: async () => buf });
    const result = await fetchShare('abc123');
    expect(result).toBe(buf);
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
