-- Multi-user: accounts, sessions, match ownership and admin-granted (view-only) match access.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  -- NULL until first login; the admin's first login uses the API_TOKEN secret as password.
  password_hash TEXT,
  disabled_at INTEGER,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE match_access (
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  revoked_at INTEGER,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX match_access_user ON match_access (user_id, synced_at);

INSERT INTO users (id, username, role, created_at) VALUES ('admin', 'admin', 'admin', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- Existing matches were recorded by the single (admin) user.
ALTER TABLE matches ADD COLUMN owner_id TEXT;
UPDATE matches SET owner_id = 'admin';
CREATE INDEX matches_owner ON matches (owner_id);

ALTER TABLE points ADD COLUMN match_id TEXT;
UPDATE points SET match_id = json_extract(data, '$.matchId');
CREATE INDEX points_match ON points (match_id);
