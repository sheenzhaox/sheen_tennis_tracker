PRAGMA defer_foreign_keys = ON;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'coach')),
  password_hash TEXT,
  disabled_at INTEGER,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL,
  player_id TEXT UNIQUE REFERENCES players (id)
);
INSERT INTO users_new (id, username, role, password_hash, disabled_at, failed_logins, locked_until, created_at)
SELECT id, username, role, password_hash, disabled_at, failed_logins, locked_until, created_at FROM users;
-- Stage dependent sessions while rebuilding users, preserving every token and expiry.
CREATE TABLE sessions_0007_backup AS SELECT * FROM sessions;
DELETE FROM sessions;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
INSERT INTO sessions SELECT * FROM sessions_0007_backup;
DROP TABLE sessions_0007_backup;

ALTER TABLE players ADD COLUMN created_by TEXT REFERENCES users (id);
UPDATE players SET created_by = owner_id;

CREATE TABLE clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  synced_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE UNIQUE INDEX clubs_name ON clubs (name) WHERE deleted_at IS NULL;
CREATE INDEX clubs_synced_at ON clubs (synced_at);

CREATE TABLE player_clubs (
  player_id TEXT NOT NULL REFERENCES players (id),
  club_id TEXT NOT NULL REFERENCES clubs (id),
  PRIMARY KEY (player_id, club_id)
);
CREATE INDEX player_clubs_club ON player_clubs (club_id, player_id);
CREATE TABLE user_clubs (
  user_id TEXT NOT NULL REFERENCES users (id),
  club_id TEXT NOT NULL REFERENCES clubs (id),
  PRIMARY KEY (user_id, club_id)
);

-- NULL authors preserve older shared notes as admin-only without guessing their creator.
CREATE TABLE player_notes (
  player_id TEXT NOT NULL REFERENCES players (id),
  user_id TEXT REFERENCES users (id),
  notes TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, user_id)
);
CREATE UNIQUE INDEX player_notes_legacy ON player_notes (player_id) WHERE user_id IS NULL;
INSERT INTO player_notes (player_id, user_id, notes, updated_at)
SELECT id, owner_id, json_extract(data, '$.notes'), updated_at FROM players
WHERE json_type(data, '$.notes') = 'text' AND json_extract(data, '$.notes') != '';

-- Only existing system players acquire club memberships; private players remain private.
INSERT INTO clubs (id, name, updated_at, synced_at, data)
SELECT 'legacy-club-' || lower(hex(randomblob(16))), trim(json_extract(data, '$.club')),
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000, '{}'
FROM players WHERE owner_id IS NULL AND deleted_at IS NULL
  AND json_type(data, '$.club') = 'text' AND trim(json_extract(data, '$.club')) != ''
GROUP BY trim(json_extract(data, '$.club')) COLLATE NOCASE;
UPDATE clubs SET data = json_object('id', id, 'name', name, 'createdAt', updated_at, 'updatedAt', updated_at);
INSERT INTO player_clubs (player_id, club_id)
SELECT p.id, c.id FROM players p JOIN clubs c ON c.name = trim(json_extract(p.data, '$.club')) COLLATE NOCASE
WHERE p.owner_id IS NULL AND p.deleted_at IS NULL;
UPDATE players SET data = json_set(data, '$.legacyClub', json_extract(data, '$.club'))
WHERE owner_id IS NOT NULL AND json_type(data, '$.club') = 'text';
UPDATE players SET data = json_remove(data, '$.notes', '$.club'),
  synced_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;

CREATE TABLE access_version (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL);
INSERT INTO access_version VALUES (1, 1);
