import { hashPassword } from './auth';
import { isId, isPassword, isUsername, json, readJson, type Env, type User } from './http';

interface UserListRow {
  id: string;
  username: string;
  role: 'admin' | 'user';
  disabled_at: number | null;
  created_at: number;
}

export async function listUsers(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT id, username, role, disabled_at, created_at FROM users ORDER BY username').all<UserListRow>();
  return json({
    users: results.map((u) => ({ id: u.id, username: u.username, role: u.role, disabled: !!u.disabled_at, createdAt: u.created_at })),
  });
}

const isRole = (v: unknown): v is 'admin' | 'user' => v === 'admin' || v === 'user';

export async function createUser(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ username?: unknown; password?: unknown; role?: unknown }>(req);
  if (body instanceof Response) return body;
  if (!isUsername(body.username)) return json({ error: 'Username: 2-32 letters, digits, ".", "-" or "_".' }, 400);
  if (!isPassword(body.password)) return json({ error: 'Password must be 8-200 characters.' }, 400);
  const role = isRole(body.role) ? body.role : 'user';
  const id = crypto.randomUUID();
  const res = await env.DB.prepare(
    'INSERT INTO users (id, username, role, password_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING',
  )
    .bind(id, body.username, role, await hashPassword(body.password), Date.now())
    .run();
  if (!res.meta.changes) return json({ error: 'Username already taken.' }, 409);
  return json({ id });
}

export async function updateUser(req: Request, env: Env, admin: User, id: string): Promise<Response> {
  const body = await readJson<{ password?: unknown; role?: unknown; disabled?: unknown }>(req);
  if (body instanceof Response) return body;
  if (id === admin.id && (body.role === 'user' || body.disabled === true)) {
    return json({ error: "You can't demote or disable your own account." }, 400);
  }
  const stmts: D1PreparedStatement[] = [];
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
  // Password reset or disabling signs the user out everywhere.
  if (body.password !== undefined || body.disabled === true) stmts.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id));
  await env.DB.batch(stmts);
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
