// norm must match the normalization buildBaseline applies so that
// undefined/null raw values compare equal to a stored '' or 0 baseline.
const TRACKED_FIELDS = [
  { key: 'title',    label: 'Title',                        norm: v => v ?? '' },
  { key: 'artist',   label: 'Artist',                       norm: v => v ?? '' },
  { key: 'keyIndex', label: 'Key',                          norm: v => v ?? 0 },
  { key: 'key',      label: 'Key name',                     norm: v => v ?? '' },
  { key: 'capo',     label: 'Capo',                         norm: v => v ?? 0 },
  { key: 'tempo',    label: 'Tempo' },                      // preserve undefined — matches buildBaseline
  { key: 'youtubeVideoId', label: 'YouTube Video' },         // preserve undefined — matches buildBaseline
  { key: 'youtubeStartSeconds', label: 'YouTube Start Time' }, // preserve undefined — matches buildBaseline
  { key: 'rawText',  label: 'Lyrics / Chords', isTopLevel: true },
];

export function buildBaseline(song) {
  return {
    title:    song.meta.title ?? '',
    artist:   song.meta.artist ?? '',
    rawText:  song.rawText,
    keyIndex: song.meta.keyIndex ?? 0,
    key:      song.meta.key ?? '',
    capo:     song.meta.capo ?? 0,
    tempo:    song.meta.tempo,  // preserve undefined — songs without tempo must not compare as changed
    youtubeVideoId: song.meta.youtubeVideoId,  // preserve undefined — songs without a pick must not compare as changed
    youtubeStartSeconds: song.meta.youtubeStartSeconds,  // preserve undefined — songs without a start time must not compare as changed
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

    // No sbpId AND no baseline → truly manually added → skip entirely
    if (!sbpId && !sharedBaseline) continue;

    const serverSong = serverBysbpId.get(sbpId);

    if (!serverSong) {
      // Absent from server ZIP → sharer removed this song.
      // Applies to both new imports (with sharedBaseline) and old imports
      // (sbpId present but sharedBaseline missing — imported before baseline stamping was added).
      removed.push(localSong.id);
      continue;
    }

    if (!sharedBaseline) {
      // Old import: has sbpId but no baseline (imported before this feature was deployed).
      // Retroactively stamp baseline from server values so future refreshes get full 3-way merge.
      // Don't apply any field updates — preserve whatever the user has locally.
      autoApplied.push({
        localId:     localSong.id,
        metaUpdates: {},
        rawText:     undefined,
        newBaseline: buildBaseline(serverSong),
      });
      continue;
    }

    const conflictFields = [];
    const metaUpdates    = {};
    let   newRawText     = undefined;

    for (const { key, label, isTopLevel, norm = v => v } of TRACKED_FIELDS) {
      const baseVal    = sharedBaseline[key];
      const rawLocal   = isTopLevel ? localSong.rawText : localSong.meta[key];
      const rawServer  = getFieldValue(serverSong, key);

      // Normalize before comparing so that e.g. undefined artist and '' baseline
      // are treated as identical (both mean "no artist").
      const localVal  = norm(rawLocal);
      const serverVal = norm(rawServer);

      const localChanged  = localVal  !== baseVal;
      const serverChanged = serverVal !== baseVal;

      if (!serverChanged) continue;  // server didn't touch it — keep local

      if (!localChanged) {
        // Use the normalized value so a cleared field (e.g. artist set to '')
        // is stored as '' rather than undefined, keeping index guards reliable.
        if (isTopLevel) newRawText = rawServer;   // rawText has no norm; rawServer === serverVal
        else metaUpdates[key] = serverVal;
      } else {
        conflictFields.push({ key, label, mine: rawLocal, theirs: rawServer });
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
