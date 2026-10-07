CREATE TABLE public_stats_links (
  match_id TEXT PRIMARY KEY REFERENCES matches (id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);