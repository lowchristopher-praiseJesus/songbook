import { describe, it, expect } from 'vitest';
import { mergeSharedCollection, buildBaseline } from '../lib/mergeSharedCollection';

function makeSong({ id, sbpId, keyIndex = 0, key = 'C', capo = 0, tempo = 120, rawText = 'Hello', baseline = null }) {
  return {
    id,
    rawText,
    meta: {
      title: `Song ${id}`,
      artist: '',
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

function makeServerSong({ sbpId, keyIndex = 0, key = 'C', capo = 0, tempo = 120, rawText = 'Hello' }) {
  return {
    rawText,
    meta: { title: `Song ${sbpId}`, artist: '', keyIndex, key, capo, tempo, sbpId },
    sections: [],
  };
}

describe('buildBaseline', () => {
  it('extracts the tracked fields from a song', () => {
    const song = makeSong({ id: '1', sbpId: 'A', keyIndex: 3, key: 'Eb', capo: 2, tempo: 90, rawText: 'verse' });
    expect(buildBaseline(song)).toEqual({ keyIndex: 3, key: 'Eb', capo: 2, tempo: 90, rawText: 'verse' });
  });
});

describe('mergeSharedCollection', () => {
  const baseline = { keyIndex: 0, key: 'C', capo: 0, tempo: 120, rawText: 'Hello' };

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
});
