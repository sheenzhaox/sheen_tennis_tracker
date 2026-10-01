-- Generic sync tables: key columns + full record as JSON (query with json_extract).
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  synced_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX players_synced_at ON players (synced_at);

CREATE TABLE rule_sets (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  synced_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX rule_sets_synced_at ON rule_sets (synced_at);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  synced_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX matches_synced_at ON matches (synced_at);
