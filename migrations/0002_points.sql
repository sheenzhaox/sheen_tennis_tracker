CREATE TABLE points (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  synced_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX points_synced_at ON points (synced_at);
