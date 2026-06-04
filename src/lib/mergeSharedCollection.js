const TRACKED_FIELDS = [
  { key: 'keyIndex', label: 'Key' },
  { key: 'key',      label: 'Key name' },
  { key: 'capo',     label: 'Capo' },
  { key: 'tempo',    label: 'Tempo' },
  { key: 'rawText',  label: 'Lyrics / Chords', isTopLevel: true },
];

export function buildBaseline(song) {
  return {
    rawText:  song.rawText,
    keyIndex: song.meta.keyIndex ?? 0,
    key:      song.meta.key ?? '',
    capo:     song.meta.capo ?? 0,
    tempo:    song.meta.tempo ?? 0,
  };
}

function getFieldValue(song, fieldKey) {
  if (fieldKey === 'rawText') return song.rawText;
  return song.meta[fieldKey];
}

export function mergeSharedCollection(localCollection, localSongs, serverSongs) {
  const serverBysbpId = new Map(serverSongs.map(s => [s.meta.sbpId, s]));
  const localBysbpId  = new Map(localSongs.filter(s => s.meta.sbpId).map(s => [s.meta.sbpId, s]));

  const autoApplied = [];
  const conflicts   = [];
  const removed     = [];

  for (const localSong of localSongs) {
    const { sbpId, sharedBaseline } = localSong.meta;
    if (!sharedBaseline) continue;  // manually added — skip removal + merge

    const serverSong = serverBysbpId.get(sbpId);
    if (!serverSong) {
      removed.push(localSong.id);
      continue;
    }

    const conflictFields = [];
    const metaUpdates    = {};
    let   newRawText     = undefined;

    for (const { key, label, isTopLevel } of TRACKED_FIELDS) {
      const baseVal   = sharedBaseline[key];
      const localVal  = isTopLevel ? localSong.rawText : localSong.meta[key];
      const serverVal = getFieldValue(serverSong, key);

      const localChanged  = localVal  !== baseVal;
      const serverChanged = serverVal !== baseVal;

      if (!serverChanged) continue;  // server didn't touch it — keep local

      if (!localChanged) {
        if (isTopLevel) newRawText = serverVal;
        else metaUpdates[key] = serverVal;
      } else {
        conflictFields.push({ key, label, mine: localVal, theirs: serverVal });
      }
    }

    const newBaseline = buildBaseline(serverSong);

    if (conflictFields.length > 0) {
      conflicts.push({
        localId:          localSong.id,
        songTitle:        localSong.meta.title,
        fields:           conflictFields,
        _autoMetaUpdates: metaUpdates,
        _autoRawText:     newRawText,
        _newBaseline:     newBaseline,
      });
    } else if (Object.keys(metaUpdates).length > 0 || newRawText !== undefined) {
      autoApplied.push({
        localId:     localSong.id,
        metaUpdates,
        rawText:     newRawText,
        newBaseline,
      });
    }
  }

  const newSongs = serverSongs
    .filter(s => s.meta.sbpId && !localBysbpId.has(s.meta.sbpId))
    .map(s => ({
      ...s,
      meta: { ...s.meta, sharedBaseline: buildBaseline(s) },
    }));

  const serverSbpIdOrder = serverSongs.map(s => s.meta.sbpId).filter(Boolean);

  return { autoApplied, conflicts, newSongs, removed, serverSbpIdOrder };
}
