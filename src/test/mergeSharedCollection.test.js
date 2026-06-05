import { describe, it, expect } from 'vitest';
import { mergeSharedCollection, buildBaseline } from '../lib/mergeSharedCollection';

function makeSong({ id, sbpId, title = 'TestSong', artist = '', keyIndex = 0, key = 'C', capo = 0, tempo = 120, rawText = 'Hello', baseline = null }) {
  return {
    id,
    rawText,
    meta: {
      title,
      artist,
      keyIndex,
      key,
      capo,
      tempo,
      sbpId,
      ...(baseline ? { sharedBaseline: baseline } : {}),
    },
    sections: [],
  };
}

function makeServerSong({ sbpId, title = 'TestSong', artist = '', keyIndex = 0, key = 'C', capo = 0, tempo = 120, rawText = 'Hello' }) {
  return {
    rawText,
    meta: { title, artist, keyIndex, key, capo, tempo, sbpId },
    sections: [],
  };
}

describe('buildBaseline', () => {
  it('extracts the tracked fields from a song', () => {
    const song = makeSong({ id: '1', sbpId: 'A', keyIndex: 3, key: 'Eb', capo: 2, tempo: 90, rawText: 'verse' });
    expect(buildBaseline(song)).toEqual({ title: 'TestSong', artist: '', keyIndex: 3, key: 'Eb', capo: 2, tempo: 90, rawText: 'verse' });
  });

  it('preserves undefined tempo rather than coercing to 0', () => {
    const song = { rawText: 'x', meta: { keyIndex: 0, key: 'C', capo: 0, tempo: undefined } };
    expect(buildBaseline(song).tempo).toBeUndefined();
  });
});

describe('mergeSharedCollection', () => {
  const baseline = { title: 'TestSong', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120, rawText: 'Hello' };

  it('auto-applies server change when local is unchanged', () => {
    const local = makeSong({ id: 'L1', sbpId: 'S1', keyIndex: 0, key: 'C', baseline });
    const server = makeServerSong({ sbpId: 'S1', keyIndex: 2, key: 'D' });

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.autoApplied).toHaveLength(1);
    expect(result.autoApplied[0].localId).toBe('L1');
    expect(result.autoApplied[0].metaUpdates.keyIndex).toBe(2);
    expect(result.autoApplied[0].metaUpdates.key).toBe('D');
    expect(result.conflicts).toHaveLength(0);
  });

  it('keeps local change when server is unchanged', () => {
    const local = makeSong({ id: 'L1', sbpId: 'S1', keyIndex: 4, key: 'E', baseline });
    const server = makeServerSong({ sbpId: 'S1', keyIndex: 0, key: 'C' });

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.autoApplied).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it('produces a conflict when both sides changed the same field', () => {
    const local = makeSong({ id: 'L1', sbpId: 'S1', keyIndex: 4, key: 'E', baseline });
    const server = makeServerSong({ sbpId: 'S1', keyIndex: 2, key: 'D' });

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].localId).toBe('L1');
    const keyConflict = result.conflicts[0].fields.find(f => f.key === 'keyIndex');
    expect(keyConflict).toBeTruthy();
    expect(keyConflict.mine).toBe(4);
    expect(keyConflict.theirs).toBe(2);
    expect(result.autoApplied).toHaveLength(0);
  });

  it('adds server song not present locally to newSongs', () => {
    const local = makeSong({ id: 'L1', sbpId: 'S1', baseline });
    const serverNew = makeServerSong({ sbpId: 'S2', keyIndex: 5, key: 'F' });
    const serverExisting = makeServerSong({ sbpId: 'S1' });

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [serverNew, serverExisting]);

    expect(result.newSongs).toHaveLength(1);
    expect(result.newSongs[0].meta.sbpId).toBe('S2');
    expect(result.newSongs[0].meta.sharedBaseline).toBeTruthy();
  });

  it('removes local song with sharedBaseline not in server ZIP', () => {
    const local = makeSong({ id: 'L1', sbpId: 'S1', baseline });
    const server = makeServerSong({ sbpId: 'S2' });

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.removed).toContain('L1');
  });

  it('does NOT remove manually-added local songs (no sharedBaseline)', () => {
    const manual = makeSong({ id: 'M1', sbpId: null, baseline: null });
    const server = makeServerSong({ sbpId: 'S2' });

    const result = mergeSharedCollection({ songIds: ['M1'] }, [manual], [server]);

    expect(result.removed).not.toContain('M1');
  });

  it('returns serverSbpIdOrder matching server ZIP order', () => {
    const localA = makeSong({ id: 'LA', sbpId: 'SA', baseline });
    const localB = makeSong({ id: 'LB', sbpId: 'SB', baseline });
    const serverSongs = [makeServerSong({ sbpId: 'SB' }), makeServerSong({ sbpId: 'SA' })];

    const result = mergeSharedCollection({ songIds: ['LA', 'LB'] }, [localA, localB], serverSongs);

    expect(result.serverSbpIdOrder).toEqual(['SB', 'SA']);
  });

  it('no changes when nothing differs', () => {
    const local = makeSong({ id: 'L1', sbpId: 'S1', keyIndex: 0, key: 'C', rawText: 'Hello', baseline });
    const server = makeServerSong({ sbpId: 'S1', keyIndex: 0, key: 'C', rawText: 'Hello' });

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.autoApplied).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.newSongs).toHaveLength(0);
  });

  it('auto-applies server artist clear and stores empty string (not undefined) in metaUpdates', () => {
    // User 2 cleared the artist. sbpParser converts '' author to undefined, but the
    // patch must store '' so the index guard (metaUpdates.artist !== undefined) still fires.
    const baselineWithArtist = { title: 'Song', artist: 'City Harvest Church', keyIndex: 0, key: 'C', capo: 0, tempo: 120, rawText: 'Hello' };
    const local = {
      id: 'L1', rawText: 'Hello',
      meta: { title: 'Song', artist: 'City Harvest Church', keyIndex: 0, key: 'C', capo: 0, tempo: 120, sbpId: 'S1', sharedBaseline: baselineWithArtist },
      sections: [],
    };
    // Server artist is undefined because sbpParser uses s.author || undefined and author was ''.
    const server = { rawText: 'Hello', meta: { title: 'Song', artist: undefined, keyIndex: 0, key: 'C', capo: 0, tempo: 120, sbpId: 'S1' }, sections: [] };

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.autoApplied).toHaveLength(1);
    expect(result.autoApplied[0].metaUpdates.artist).toBe('');  // normalized, not undefined
  });

  it('does not produce a false artist conflict when both have undefined artist but baseline has empty string', () => {
    // sbpParser sets artist: s.author || undefined, so '' becomes undefined.
    // buildBaseline normalises undefined to '' — the comparison must treat them as equal.
    const baselineEmptyArtist = { title: 'Song', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120, rawText: 'Hello' };
    const local = {
      id: 'L1', rawText: 'Hello',
      meta: { title: 'Song', artist: undefined, keyIndex: 0, key: 'C', capo: 0, tempo: 120, sbpId: 'S1', sharedBaseline: baselineEmptyArtist },
      sections: [],
    };
    const server = { rawText: 'Hello', meta: { title: 'Song', artist: undefined, keyIndex: 0, key: 'C', capo: 0, tempo: 120, sbpId: 'S1' }, sections: [] };

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.autoApplied).toHaveLength(0);
  });

  it('does not produce a false tempo conflict when both sides have undefined tempo', () => {
    // parseSbpFile returns tempo: undefined for songs with TempoInt=0.
    // buildBaseline must preserve undefined so the comparison sees undefined===undefined (no change).
    const baselineNoTempo = { title: 'Song', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: undefined, rawText: 'Hello' };
    const local = {
      id: 'L1', rawText: 'Hello',
      meta: { title: 'Song', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: undefined, sbpId: 'S1', sharedBaseline: baselineNoTempo },
      sections: [],
    };
    const server = { rawText: 'Hello', meta: { title: 'Song', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: undefined, sbpId: 'S1' }, sections: [] };

    const result = mergeSharedCollection({ songIds: ['L1'] }, [local], [server]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.autoApplied).toHaveLength(0);
  });

  it('removes old-import song (sbpId set, no sharedBaseline) absent from server ZIP', () => {
    // Songs imported before the baseline-stamping fix have sbpId but no sharedBaseline
    const oldImport = makeSong({ id: 'L1', sbpId: 'S1', baseline: null });
    const server = makeServerSong({ sbpId: 'S2' }); // S1 gone from server

    const result = mergeSharedCollection({ songIds: ['L1'] }, [oldImport], [server]);

    expect(result.removed).toContain('L1');
  });

  it('stamps baseline retroactively on old-import song still present in server ZIP', () => {
    const oldImport = makeSong({ id: 'L1', sbpId: 'S1', keyIndex: 2, key: 'D', baseline: null });
    const server = makeServerSong({ sbpId: 'S1', keyIndex: 2, key: 'D' });

    const result = mergeSharedCollection({ songIds: ['L1'] }, [oldImport], [server]);

    expect(result.removed).not.toContain('L1');
    // Baseline stamped via autoApplied with empty metaUpdates
    const patch = result.autoApplied.find(p => p.localId === 'L1');
    expect(patch).toBeTruthy();
    expect(patch.newBaseline).toMatchObject({ keyIndex: 2, key: 'D' });
    expect(patch.metaUpdates).toEqual({});
    expect(patch.rawText).toBeUndefined();
  });

  it('does NOT remove song with no sbpId AND no sharedBaseline (truly manually added)', () => {
    const manual = makeSong({ id: 'M1', sbpId: null, baseline: null });
    const server = makeServerSong({ sbpId: 'S2' });

    const result = mergeSharedCollection({ songIds: ['M1'] }, [manual], [server]);

    expect(result.removed).not.toContain('M1');
  });
});
