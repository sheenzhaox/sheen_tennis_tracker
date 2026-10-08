-- Player ownership: NULL = added by an admin (visible to everyone); otherwise private to that user.
-- Existing players stay shared (NULL) so current matches and player lists keep working.
ALTER TABLE players ADD COLUMN owner_id TEXT;
CREATE INDEX players_owner ON players (owner_id);
