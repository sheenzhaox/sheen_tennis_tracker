import { hashPassword } from './auth';
import { isId, isPassword, isUsername, json, readJson, type Env, type User } from './http';
import { ACCOUNT_SELECT, accountData, bumpAccess, type AccountRow } from './access';
import { isPlayerEmail, type UserRole } from '../src/model/types';

interface UserListRow extends AccountRow {
  disabled_at: number | null;
  created_at: number;
}

export async function listUsers(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`${ACCOUNT_SELECT} ORDER BY u.username`).all<UserListRow>();
  return json({
    users: results.map((u) => ({ ...accountData(u), disabled: !!u.disabled_at, createdAt: u.created_at })),
  });
}

const isRole = (v: unknown): v is UserRole => v === 'admin' || v === 'user' || v === 'coach';

function profileError({ name, email }: { name?: unknown; email?: unknown }): Response | null {
  if (name !== undefined && name !== null && (typeof name !== 'string' || name.trim().length > 200)) {
    return json({ error: 'Name must be at most 200 characters.' }, 400);
  }
  if (email !== undefined && email !== null
    && (typeof email !== 'string' || (email.trim() !== '' && !isPlayerEmail(email.trim())))) {
    return json({ error: 'Enter a valid email address, or leave it blank.' }, 400);
  }
  return null;
}

export async function validateClubs(db: D1Database, value: unknown): Promise<string[] | Response> {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isId)) return json({ error: 'Invalid clubs.' }, 400);
  const ids = [...new Set(value)];
  const { results } = await db.prepare('SELECT id FROM clubs WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?1))')
    .bind(JSON.stringify(ids)).all<{ id: string }>();
  return results.length === ids.length ? ids : json({ error: 'One or more clubs no longer exist.' }, 400);
}

async function validatePlayerLink(db: D1Database, playerId: unknown, userId?: string): Promise<Response | null> {
  if (!isId(playerId)) return json({ error: 'Choose a system-level player.' }, 400);
  const player = await db.prepare('SELECT id FROM players WHERE id = ?1 AND owner_id IS NULL AND deleted_at IS NULL').bind(playerId).first();
  if (!player) return json({ error: 'The linked player must be a live system-level player.' }, 400);
  const linked = await db.prepare('SELECT id FROM users WHERE player_id = ?1 AND id != ?2').bind(playerId, userId ?? '').first();
  return linked ? json({ error: 'This player is already linked to an account.' }, 409) : null;
}

export async function createUser(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ username?: unknown; password?: unknown; role?: unknown; playerId?: unknown; clubIds?: unknown; name?: unknown; email?: unknown }>(req);
  if (body instanceof Response) return body;
  if (!isUsername(body.username)) return json({ error: 'Username: 2-32 letters, digits, ".", "-" or "_".' }, 400);
  if (!isPassword(body.password)) return json({ error: 'Password must be 8-200 characters.' }, 400);
  const invalidProfile = profileError(body);
  if (invalidProfile) return invalidProfile;
  if (body.role !== undefined && !isRole(body.role)) return json({ error: 'Invalid role.' }, 400);
  const role = body.role ?? 'user';
  const playerId = body.playerId ?? null;
  if (role === 'user' || playerId !== null) {
    const error = await validatePlayerLink(env.DB, playerId);
    if (error) return error;
  }
  const clubs = await validateClubs(env.DB, body.clubIds ?? []);
  if (clubs instanceof Response) return clubs;
  const id = crypto.randomUUID();
  const [res] = await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users (id, username, role, password_hash, created_at, player_id, name, email) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT DO NOTHING',
    ).bind(id, body.username, role, await hashPassword(body.password), Date.now(), playerId,
      typeof body.name === 'string' ? body.name.trim() || null : null,
      typeof body.email === 'string' ? body.email.trim() || null : null),
    env.DB.prepare(`INSERT INTO user_clubs (user_id, club_id) SELECT ?1, value FROM json_each(?2)
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1)`).bind(id, JSON.stringify(role === 'coach' ? clubs : [])),
    bumpAccess(env.DB),
  ]);
  if (!res.meta.changes) return json({ error: 'Username already taken or player already linked.' }, 409);
  return json({ id });
}

export async function updateUser(req: Request, env: Env, admin: User, id: string): Promise<Response> {
  const body = await readJson<{ password?: unknown; role?: unknown; disabled?: unknown; playerId?: unknown; clubIds?: unknown; name?: unknown; email?: unknown }>(req);
  if (body instanceof Response) return body;
  const invalidProfile = profileError(body);
  if (invalidProfile) return invalidProfile;
  if (id === admin.id && ((body.role !== undefined && body.role !== 'admin') || body.disabled === true)) {
    return json({ error: "You can't demote or disable your own account." }, 400);
  }
  const stmts: D1PreparedStatement[] = [];
  const current = await env.DB.prepare('SELECT role, player_id FROM users WHERE id = ?1')
    .bind(id).first<{ role: UserRole; player_id: string | null }>();
  if (!current) return json({ error: 'User not found.' }, 404);
  if (body.name !== undefined) stmts.push(env.DB.prepare('UPDATE users SET name = ?2 WHERE id = ?1')
    .bind(id, typeof body.name === 'string' ? body.name.trim() || null : null));
  if (body.email !== undefined) stmts.push(env.DB.prepare('UPDATE users SET email = ?2 WHERE id = ?1')
    .bind(id, typeof body.email === 'string' ? body.email.trim() || null : null));
  if (body.role === 'user' && current.role !== 'user' && body.playerId === undefined) {
    const error = await validatePlayerLink(env.DB, current.player_id, id);
    if (error) return error;
  }
  if (body.disabled !== undefined && typeof body.disabled !== 'boolean') return json({ error: 'Invalid disabled flag.' }, 400);
  if (body.playerId !== undefined) {
    if (body.playerId !== null || (body.role ?? current.role) === 'user') {
      const error = await validatePlayerLink(env.DB, body.playerId, id);
      if (error) return error;
    }
    stmts.push(env.DB.prepare('UPDATE users SET player_id = ?2 WHERE id = ?1').bind(id, body.playerId));
  }
  if (body.clubIds !== undefined) {
    const clubs = await validateClubs(env.DB, body.clubIds);
    if (clubs instanceof Response) return clubs;
    stmts.push(env.DB.prepare('DELETE FROM user_clubs WHERE user_id = ?1').bind(id));
    stmts.push(env.DB.prepare('INSERT INTO user_clubs (user_id, club_id) SELECT ?1, value FROM json_each(?2)')
      .bind(id, JSON.stringify((body.role ?? current.role) === 'coach' ? clubs : [])));
  }
  if (body.password !== undefined) {
    if (!isPassword(body.password)) return json({ error: 'Password must be 8-200 characters.' }, 400);
    stmts.push(env.DB.prepare('UPDATE users SET password_hash = ?2, failed_logins = 0, locked_until = NULL WHERE id = ?1').bind(id, await hashPassword(body.password)));
  }
  if (body.role !== undefined) {
    if (!isRole(body.role)) return json({ error: 'invalid role' }, 400);
    stmts.push(env.DB.prepare('UPDATE users SET role = ?2 WHERE id = ?1').bind(id, body.role));
  }
  if (body.disabled !== undefined) {
    stmts.push(env.DB.prepare('UPDATE users SET disabled_at = ?2 WHERE id = ?1').bind(id, body.disabled === true ? Date.now() : null));
  }
  if (!stmts.length) return json({ error: 'nothing to update' }, 400);
  stmts.push(bumpAccess(env.DB));
  // Password reset or disabling signs the user out everywhere.
  if (body.password !== undefined || body.disabled === true) stmts.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id));
  try {
    await env.DB.batch(stmts);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed: users.player_id')) {
      return json({ error: 'This player is already linked to an account.' }, 409);
    }
    throw err;
  }
  return json({ ok: true });
}

export async function getMatchAccess(env: Env, matchId: string): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT user_id FROM match_access WHERE match_id = ?1 AND revoked_at IS NULL')
    .bind(matchId)
    .all<{ user_id: string }>();
  return json({ userIds: results.map((r) => r.user_id) });
}

/** Sets which users (besides the owner) can view a match. */
export async function setMatchAccess(req: Request, env: Env, matchId: string): Promise<Response> {
  const body = await readJson<{ userIds?: unknown }>(req);
  if (body instanceof Response) return body;
  if (!Array.isArray(body.userIds) || body.userIds.length > 100 || !body.userIds.every(isId)) return json({ error: 'invalid userIds' }, 400);
  const match = await env.DB.prepare('SELECT owner_id FROM matches WHERE id = ?1').bind(matchId).first<{ owner_id: string | null }>();
  if (!match) return json({ error: 'Match not synced yet.' }, 404);

  const now = Date.now();
  const ids = JSON.stringify(body.userIds.filter((u) => u !== match.owner_id));
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE match_access SET revoked_at = ?2, synced_at = ?2
       WHERE match_id = ?1 AND revoked_at IS NULL AND user_id NOT IN (SELECT value FROM json_each(?3))`,
    ).bind(matchId, now, ids),
    env.DB.prepare(
      `INSERT INTO match_access (match_id, user_id, revoked_at, synced_at)
       SELECT ?1, u.id, NULL, ?2 FROM users u WHERE u.id IN (SELECT value FROM json_each(?3))
       ON CONFLICT (match_id, user_id) DO UPDATE SET revoked_at = NULL, synced_at = excluded.synced_at
       WHERE match_access.revoked_at IS NOT NULL`,
    ).bind(matchId, now, ids),
    // Re-send the match to newly granted users whose sync cursor is already past it.
    env.DB.prepare('UPDATE matches SET synced_at = ?2 WHERE id = ?1').bind(matchId, now),
    env.DB.prepare('UPDATE points SET synced_at = ?2 WHERE match_id = ?1').bind(matchId, now),
    // Players may be private to the match owner; granted users need them for names.
    env.DB.prepare(
      `UPDATE players SET synced_at = ?2 WHERE id IN (
         SELECT json_extract(data, '$.playerAId') FROM matches WHERE id = ?1
         UNION SELECT json_extract(data, '$.playerBId') FROM matches WHERE id = ?1)`,
    ).bind(matchId, now),
  ]);
  return getMatchAccess(env, matchId);
}
