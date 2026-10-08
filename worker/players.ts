import { validateClubs } from './admin';
import { bumpAccess } from './access';
import { isId, json, readJson, type Env } from './http';

export async function managePlayer(req: Request, env: Env, id: string): Promise<Response> {
  const player = await env.DB.prepare('SELECT owner_id FROM players WHERE id = ?1 AND deleted_at IS NULL')
    .bind(id).first<{ owner_id: string | null }>();
  if (!player) return json({ error: 'Player not synced yet or no longer available.' }, 404);
  const body = await readJson<{ ownerId?: unknown; clubIds?: unknown }>(req);
  if (body instanceof Response) return body;
  const ownerId = body.ownerId === undefined ? player.owner_id : body.ownerId;
  if (ownerId !== null) {
    if (!isId(ownerId) || !await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(ownerId).first()) {
      return json({ error: 'Choose a valid player owner.' }, 400);
    }
    if (await env.DB.prepare('SELECT id FROM users WHERE player_id = ?1').bind(id).first()) {
      return json({ error: 'Unlink the player from their account before making them private.' }, 400);
    }
  }
  const stmts: D1PreparedStatement[] = [];
  if (body.clubIds !== undefined) {
    const clubs = await validateClubs(env.DB, body.clubIds);
    if (clubs instanceof Response) return clubs;
    if (ownerId !== null && clubs.length) return json({ error: 'Only system-level players can have club memberships.' }, 400);
    stmts.push(env.DB.prepare('DELETE FROM player_clubs WHERE player_id = ?1').bind(id));
    stmts.push(env.DB.prepare('INSERT INTO player_clubs (player_id, club_id) SELECT ?1, value FROM json_each(?2)')
      .bind(id, JSON.stringify(clubs)));
  }
  if (ownerId !== null) stmts.push(env.DB.prepare('DELETE FROM player_clubs WHERE player_id = ?1').bind(id));
  stmts.push(env.DB.prepare('UPDATE players SET owner_id = ?2, synced_at = ?3 WHERE id = ?1').bind(id, ownerId, Date.now()));
  stmts.push(bumpAccess(env.DB));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

export async function managePlayerNotes(req: Request, env: Env, id: string): Promise<Response> {
  if (!await env.DB.prepare('SELECT id FROM players WHERE id = ?1 AND deleted_at IS NULL').bind(id).first()) {
    return json({ error: 'Player not synced yet or no longer available.' }, 404);
  }
  if (req.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT n.user_id AS userId, u.username, n.notes, n.updated_at AS updatedAt
       FROM player_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.player_id = ?1 ORDER BY u.username`,
    ).bind(id).all();
    return json({ notes: results });
  }
  const body = await readJson<{ userId?: unknown; notes?: unknown }>(req, 100_000);
  if (body instanceof Response) return body;
  if ((body.userId !== null && !isId(body.userId)) || typeof body.notes !== 'string' || body.notes.length > 20_000) {
    return json({ error: 'Invalid private note.' }, 400);
  }
  if (body.userId !== null && !await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(body.userId).first()) {
    return json({ error: 'Note author not found.' }, 404);
  }
  const now = Date.now();
  const stmt = body.userId === null
    ? env.DB.prepare('UPDATE player_notes SET notes = ?2, updated_at = MAX(updated_at + 1, ?3) WHERE player_id = ?1 AND user_id IS NULL').bind(id, body.notes, now)
    : env.DB.prepare(`INSERT INTO player_notes (player_id, user_id, notes, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (player_id, user_id) DO UPDATE SET notes = excluded.notes, updated_at = MAX(player_notes.updated_at + 1, excluded.updated_at)`)
      .bind(id, body.userId, body.notes, now);
  await env.DB.batch([stmt, env.DB.prepare('UPDATE players SET synced_at = ?2 WHERE id = ?1').bind(id, now)]);
  return json({ ok: true });
}
