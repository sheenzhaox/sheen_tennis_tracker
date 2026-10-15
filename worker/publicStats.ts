import type { Match, Point, PublicStats, Rules } from '../src/model/types';
import { json, readJson, type Env, type User } from './http';
import { mayShareStats } from './access';

export const isStatsToken = (token: string) => /^[a-f0-9]{64}$/.test(token);

export async function hashStatsToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function manageStatsLink(req: Request, env: Env, user: User, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT owner_id FROM matches WHERE id = ?1 AND deleted_at IS NULL')
    .bind(matchId).first<{ owner_id: string | null }>();
  if (!match) return json({ error: 'Match not synced yet or no longer available.' }, 404);
  if (!await mayShareStats(env.DB, user, matchId, match.owner_id)) return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') {
    const link = await env.DB.prepare('SELECT token FROM public_stats_links WHERE match_id = ?1 AND revoked_at IS NULL')
      .bind(matchId).first<{ token: string | null }>();
    return json({ active: !!link, token: link?.token ?? undefined });
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('UPDATE public_stats_links SET revoked_at = ?2 WHERE match_id = ?1').bind(matchId, Date.now()).run();
    return json({ active: false });
  }
  if (req.method === 'PUT') {
    const body = await readJson<{ token?: unknown }>(req);
    if (body instanceof Response) return body;
    if (typeof body.token !== 'string' || !isStatsToken(body.token)) return json({ error: 'Invalid stats link.' }, 400);
    const restored = await env.DB.prepare(
      'UPDATE public_stats_links SET token = ?2 WHERE match_id = ?1 AND token_hash = ?3 AND revoked_at IS NULL',
    ).bind(matchId, body.token, await hashStatsToken(body.token)).run();
    if (!restored.meta.changes) return json({ error: 'This link does not match the active link for this match.' }, 404);
    return json({ token: body.token, active: true });
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(
    `INSERT INTO public_stats_links (match_id, token_hash, created_at, revoked_at, token) VALUES (?1, ?2, ?3, NULL, ?4)
     ON CONFLICT (match_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, revoked_at = NULL, token = excluded.token`,
  ).bind(matchId, await hashStatsToken(token), Date.now(), token).run();
  return json({ token, active: true });
}

function publicRules(rules: Rules): Rules {
  return {
    bestOf: rules.bestOf, gamesPerSet: rules.gamesPerSet, tiebreakAt: rules.tiebreakAt,
    tiebreakPoints: rules.tiebreakPoints, noAd: rules.noAd, finalSet: rules.finalSet,
    finalSetTiebreakPoints: rules.finalSetTiebreakPoints, matchTiebreakPoints: rules.matchTiebreakPoints,
  };
}

export function publicStatsData(match: Match, points: Point[], nameA: string, nameB: string): PublicStats {
  return {
    nameA, nameB,
    match: {
      id: 'public', playerAId: 'A', playerBId: 'B', ruleSetId: 'public', ruleSetName: '',
      rules: publicRules(match.rules), firstServer: match.firstServer, status: match.status, updatedAt: 0,
      finalisation: match.finalisation ? { winner: match.finalisation.winner, reason: match.finalisation.reason } : undefined,
    },
    points: points.map((point, index) => ({
      id: `point-${index}`, matchId: 'public', seq: index, server: point.server, winner: point.winner,
      end: point.end, createdAt: 0, updatedAt: 0,
      serves: point.serves.map((serve) => ({
        result: serve.result, location: serve.location, type: serve.type, fault: serve.fault,
        return: serve.return ? { stroke: serve.return.stroke, direction: serve.return.direction, error: serve.return.error } : undefined,
      })),
      rally: point.rally ? {
        count: point.rally.count, ending: point.rally.ending, stroke: point.rally.stroke,
        error: point.rally.error, lucky: point.rally.lucky, direction: point.rally.direction,
        shotType: point.rally.shotType, position: point.rally.position,
      } : undefined,
    })),
  };
}

export async function getPublicStats(env: Env, token: string): Promise<Response> {
  if (!isStatsToken(token)) return json({ error: 'Stats link not found or revoked.' }, 404);
  const tokenHash = await hashStatsToken(token);
  const [matches, points] = await env.DB.batch<{ data: string; name_a?: string | null; name_b?: string | null }>([
    env.DB.prepare(
      `SELECT m.data, json_extract(a.data, '$.name') AS name_a, json_extract(b.data, '$.name') AS name_b
       FROM public_stats_links l JOIN matches m ON m.id = l.match_id
       LEFT JOIN players a ON a.id = json_extract(m.data, '$.playerAId') AND a.deleted_at IS NULL
       LEFT JOIN players b ON b.id = json_extract(m.data, '$.playerBId') AND b.deleted_at IS NULL
       WHERE l.token_hash = ?1 AND l.revoked_at IS NULL AND m.deleted_at IS NULL`,
    ).bind(tokenHash),
    env.DB.prepare(
      `SELECT p.data FROM points p JOIN public_stats_links l ON l.match_id = p.match_id
       JOIN matches m ON m.id = l.match_id
       WHERE l.token_hash = ?1 AND l.revoked_at IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL
       ORDER BY json_extract(p.data, '$.seq'), json_extract(p.data, '$.createdAt'), p.id`,
    ).bind(tokenHash),
  ]);
  const row = matches.results[0];
  if (!row) return json({ error: 'Stats link not found or revoked.' }, 404);
  const response = json(publicStatsData(
    JSON.parse(row.data) as Match,
    points.results.map((point) => JSON.parse(point.data) as Point),
    row.name_a ?? 'Player A', row.name_b ?? 'Player B',
  ));
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}