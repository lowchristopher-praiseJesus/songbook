import { describe, it, expect } from 'vitest';
import { buildSbpZip } from '../lib/exportSbp';
import { parseSbpFile } from '../lib/parser/sbpParser';

// Regression cover for the "Share via link" wire format: exportSongsAsSbp is a
// thin wrapper that forwards these exact arguments to buildSbpZip, so this walks
// the share path a recipient actually receives, including the lyrics-only shape.
describe('share-via-link carries the YouTube start time', () => {
  const sharerSong = {
    id: 'L1',
    rawText: '{c: Verse}\nHello world',
    meta: {
      title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0, sbpId: 4242,
      youtubeVideoId: 'x_ekj3IOvT8', youtubeStartSeconds: 940,
    },
    sections: [],
  };

  it('survives exportSongsAsSbp → parseSbpFile with default share options', async () => {
    const blob = await buildSbpZip([sharerSong], 'My Collection', false, null).generateAsync({ type: 'uint8array' });
    const { songs } = await parseSbpFile(blob);
    expect(songs[0].meta.youtubeStartSeconds).toBe(940);
  });

  it('survives a lyrics-only share', async () => {
    const blob = await buildSbpZip([sharerSong], 'My Collection', true, null).generateAsync({ type: 'uint8array' });
    const { songs } = await parseSbpFile(blob);
    expect(songs[0].meta.youtubeStartSeconds).toBe(940);
  });
});
