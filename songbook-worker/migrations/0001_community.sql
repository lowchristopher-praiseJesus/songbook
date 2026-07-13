CREATE TABLE publications (
  id                 TEXT PRIMARY KEY,
  collection_name    TEXT NOT NULL,
  publisher_name     TEXT NOT NULL,
  publish_token_hash TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'live'
);

CREATE TABLE songs (
  id                 TEXT PRIMARY KEY,
  content_hash       TEXT NOT NULL UNIQUE,
  group_key          TEXT NOT NULL,
  title              TEXT NOT NULL,
  artist             TEXT NOT NULL,
  key_index          INTEGER,
  capo               INTEGER,
  tempo              INTEGER,
  time_sig           TEXT,
  body               TEXT NOT NULL,
  -- Denormalized display provenance, written once at first publish and never overwritten
  -- ("first publisher wins"). D1 bills rows *scanned*, and deriving these by joining
  -- song_publications -> publications on every search hit costs two correlated subqueries
  -- per row. The join is still available via song_publications when full provenance is
  -- needed; these two columns exist purely to keep search cheap.
  publisher_name     TEXT NOT NULL DEFAULT 'Anonymous',
  collection_name    TEXT NOT NULL DEFAULT '',
  first_published_at INTEGER NOT NULL,
  import_count       INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'live'
);
CREATE INDEX idx_songs_group_key ON songs(group_key);
CREATE INDEX idx_songs_status ON songs(status);

CREATE TABLE song_publications (
  song_id        TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  PRIMARY KEY (song_id, publication_id)
);
CREATE INDEX idx_song_publications_publication ON song_publications(publication_id);

-- Standalone (not external-content) FTS5: lyrics_only is derived at publish time and is
-- not a column on `songs`, and a standalone table needs no sync triggers.
CREATE VIRTUAL TABLE songs_fts USING fts5(
  song_id UNINDEXED,
  title,
  artist,
  lyrics_only
);

CREATE TABLE reports (
  id         TEXT PRIMARY KEY,
  song_id    TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX idx_reports_status ON reports(status);
