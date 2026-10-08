import type { User } from './http';

export const CLUB_MATCHES = `SELECT m.id FROM matches m WHERE EXISTS (
    SELECT 1 FROM users coach JOIN user_clubs uc ON uc.user_id = coach.id
    JOIN clubs c ON c.id = uc.club_id AND c.deleted_at IS NULL
    JOIN player_clubs pc ON pc.club_id = c.id
    JOIN players p ON p.id = pc.player_id AND p.owner_id IS NULL AND p.deleted_at IS NULL
    WHERE coach.id = ?2 AND coach.role = 'coach'
      AND p.id IN (json_extract(m.data, '$.playerAId'), json_extract(m.data, '$.playerBId')))`;

export const VISIBLE_MATCHES = `SELECT id FROM matches WHERE owner_id = ?2
  UNION SELECT match_id FROM match_access WHERE user_id = ?2 AND revoked_at IS NULL
  UNION ${CLUB_MATCHES}`;

export const VISIBLE_PLAYERS = `players.owner_id IS NULL OR players.owner_id = ?2 OR players.id IN (
  SELECT player_id FROM users WHERE id = ?2
  UNION SELECT json_extract(data, '$.playerAId') FROM matches WHERE id IN (${VISIBLE_MATCHES})
  UNION SELECT json_extract(data, '$.playerBId') FROM matches WHERE id IN (${VISIBLE_MATCHES}))`;

export const ACCOUNT_SELECT = `SELECT u.*,
  (SELECT json_group_array(uc.club_id) FROM user_clubs uc JOIN clubs c ON c.id = uc.club_id
   WHERE uc.user_id = u.id AND c.deleted_at IS NULL) AS club_ids FROM users u`;

export interface AccountRow extends User {
  player_id: string | null;
  club_ids: string;
}

export function accountData(row: AccountRow): User {
  return { id: row.id, username: row.username, role: row.role, playerId: row.player_id ?? undefined,
    clubIds: JSON.parse(row.club_ids) as string[] };
}

export const bumpAccess = (db: D1Database) => db.prepare('UPDATE access_version SET revision = revision + 1 WHERE id = 1');

export async function mayShareStats(db: D1Database, user: User, matchId: string, ownerId: string | null): Promise<boolean> {
  if (user.role === 'admin' || ownerId === user.id) return true;
  if (user.role !== 'coach') return false;
  return !!await db.prepare(`SELECT id FROM matches WHERE id = ?1 AND id IN (${CLUB_MATCHES})`)
    .bind(matchId, user.id).first();
}
