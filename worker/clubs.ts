import { bumpAccess } from './access';
import { json, readJson, type Env } from './http';

export async function manageClub(req: Request, env: Env, id?: string): Promise<Response> {
  if (req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT data FROM clubs WHERE deleted_at IS NULL ORDER BY name').all<{ data: string }>();
    return json({ clubs: results.map((row) => JSON.parse(row.data)) });
  }
  const now = Date.now();
  if (id && !await env.DB.prepare('SELECT id FROM clubs WHERE id = ?1 AND deleted_at IS NULL').bind(id).first()) {
    return json({ error: 'Club not found.' }, 404);
  }
  if (req.method === 'DELETE' && id) {
    await env.DB.batch([
      env.DB.prepare('UPDATE clubs SET deleted_at = ?2, updated_at = ?2, synced_at = ?2 WHERE id = ?1').bind(id, now),
      bumpAccess(env.DB),
    ]);
    return json({ ok: true });
  }
  const body = await readJson<{ name?: unknown }>(req);
  if (body instanceof Response) return body;
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 200) {
    return json({ error: 'Club name is required (maximum 200 characters).' }, 400);
  }
  const name = body.name.trim();
  const clubId = id ?? crypto.randomUUID();
  const stmt = id ? env.DB.prepare(
    `UPDATE clubs SET name = ?2, data = json_set(data, '$.name', ?2, '$.updatedAt', ?3), updated_at = ?3, synced_at = ?3
     WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM clubs WHERE name = ?2 AND id != ?1 AND deleted_at IS NULL)`,
  ).bind(id, name, now) : env.DB.prepare(
    'INSERT INTO clubs (id, name, updated_at, synced_at, data) VALUES (?1, ?2, ?3, ?3, ?4) ON CONFLICT DO NOTHING',
  ).bind(clubId, name, now, JSON.stringify({ id: clubId, name, createdAt: now, updatedAt: now }));
  const [res] = await env.DB.batch([stmt, bumpAccess(env.DB)]);
  if (!res.meta.changes) return json({ error: 'Club name already exists.' }, 409);
  return json({ id: clubId });
}
