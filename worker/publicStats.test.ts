import { describe, expect, it, vi } from 'vitest';
import type { Match, Point } from '../src/model/types';
import worker from './index';
import { getPublicStats, hashStatsToken, manageStatsLink, publicStatsData } from './publicStats';
import type { Env, User } from './http';
import { pointContexts, summary } from '../src/stats/matchStats';

const owner: User = { id: 'owner', username: 'owner', role: 'user' };
const match: Match = {
  id: 'private-match-id', playerAId: 'private-a', playerBId: 'private-b', ruleSetId: 'private-rules', ruleSetName: 'Standard',
  rules: { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, tiebreakPoints: 7, noAd: false, finalSet: 'regular', finalSetTiebreakPoints: 7, matchTiebreakPoints: 10 },
  firstServer: 'A', status: 'in_progress', updatedAt: 1, ownerId: 'owner', ownerName: 'Private owner', notes: 'Private notes', venue: 'Private venue',
};
const point: Point = {
  id: 'private-point-id', matchId: match.id, seq: 7, server: 'A', winner: 'A', end: 'ace',
  serves: [{ result: 'ace', location: 'wide', type: 'flat' }], createdAt: 123, updatedAt: 123, dirty: 1,
};

function setup(firstResult: unknown = { owner_id: owner.id }) {
  const first = vi.fn().mockResolvedValue(firstResult);
  const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  const bind = vi.fn();
  const statement = { bind, first, run };
  bind.mockReturnValue(statement);
  const prepare = vi.fn().mockReturnValue(statement);
  const batch = vi.fn().mockResolvedValue([{ results: [] }, { results: [] }]);
  const env: Env = {
    DB: { prepare, batch, exec: vi.fn(), withSession: vi.fn(), dump: vi.fn() },
    ENVIRONMENT: 'test', ASSETS: { fetch: vi.fn(), connect: vi.fn() },
  };
  return { env, first, run, bind, prepare, batch };
}

describe('public stats links', () => {
  it('creates a random token and persists it for owner retrieval alongside its lookup hash', async () => {
    const { env, bind } = setup();
    const response = await manageStatsLink(new Request('https://example.com', { method: 'POST' }), env, owner, match.id);
    const data = await response.json() as { token: string; active: boolean };
    expect(data.token).toMatch(/^[a-f0-9]{64}$/);
    expect(data.token).not.toContain(match.id);
    expect(data.active).toBe(true);
    expect(bind).toHaveBeenLastCalledWith(match.id, await hashStatsToken(data.token), expect.any(Number), data.token);
  });

  it('denies creation, status lookup, and revocation by a view-only user', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const { env, run } = setup();
      const response = await manageStatsLink(new Request('https://example.com', { method }), env, { ...owner, id: 'viewer' }, match.id);
      expect(response.status).toBe(403);
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('allows a club coach to share stats but rejects coaches outside the club', async () => {
    for (const permitted of [false, true]) {
      const { env, first, prepare } = setup();
      first.mockResolvedValueOnce({ owner_id: owner.id }).mockResolvedValueOnce(permitted ? { id: match.id } : null);
      const response = await manageStatsLink(new Request('https://example.com', { method: 'POST' }),
        env, { id: 'coach', username: 'coach', role: 'coach' }, match.id);
      expect(response.status).toBe(permitted ? 200 : 403);
      expect(prepare.mock.calls[1][0]).toContain("coach.role = 'coach'");
      expect(prepare.mock.calls[1][0]).not.toContain('match_access');
    }
  });

  it('retrieves the same active token for the owner and admin on subsequent visits', async () => {
    for (const user of [owner, { ...owner, id: 'admin', role: 'admin' as const }]) {
      const { env, first } = setup();
      first.mockResolvedValueOnce({ owner_id: owner.id }).mockResolvedValueOnce({ token: 'a'.repeat(64) });
      const response = await manageStatsLink(new Request('https://example.com'), env, user, match.id);
      expect(await response.json()).toEqual({ active: true, token: 'a'.repeat(64) });
    }
  });

  it('does not return a revoked token and preserves older hash-only links', async () => {
    for (const [link, expected] of [[null, { active: false }], [{ token: null }, { active: true }]]) {
      const { env, first } = setup();
      first.mockResolvedValueOnce({ owner_id: owner.id }).mockResolvedValueOnce(link);
      const response = await manageStatsLink(new Request('https://example.com'), env, owner, match.id);
      expect(await response.json()).toEqual(expected);
    }
  });

  it('restores an original URL only when its hash matches the active link', async () => {
    const token = 'b'.repeat(64);
    const { env, bind, prepare, run } = setup();
    const request = () => new Request('https://example.com', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    });
    const response = await manageStatsLink(request(), env, owner, match.id);
    expect(await response.json()).toEqual({ token, active: true });
    expect(bind).toHaveBeenLastCalledWith(match.id, token, await hashStatsToken(token));
    expect(prepare).toHaveBeenLastCalledWith(expect.stringContaining('revoked_at IS NULL'));
    run.mockResolvedValueOnce({ success: true, meta: { changes: 0 } });
    expect((await manageStatsLink(request(), env, owner, match.id)).status).toBe(404);
  });

  it('rejects malformed restored tokens without writing', async () => {
    const { env, run } = setup();
    const response = await manageStatsLink(new Request('https://example.com', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'bad' }),
    }), env, owner, match.id);
    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('allows admin management and revokes the active link', async () => {
    const { env, prepare } = setup();
    const response = await manageStatsLink(new Request('https://example.com', { method: 'DELETE' }), env, { ...owner, id: 'admin', role: 'admin' }, match.id);
    expect(await response.json()).toEqual({ active: false });
    expect(prepare).toHaveBeenLastCalledWith(expect.stringContaining('SET revoked_at'));
  });

  it('rejects deleted or unsynced matches', async () => {
    const { env, run } = setup(null);
    expect((await manageStatsLink(new Request('https://example.com', { method: 'POST' }), env, owner, match.id)).status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it('routes invalid public tokens without authentication or database access', async () => {
    const { env, prepare, batch } = setup();
    const response = await worker.fetch(new Request(`https://example.com/api/public/stats/${match.id}`), env);
    expect(response.status).toBe(404);
    expect(prepare).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown/revoked tokens and filters deleted matches and points in SQL', async () => {
    const { env, prepare } = setup();
    const response = await getPublicStats(env, 'a'.repeat(64));
    expect(response.status).toBe(404);
    expect(prepare.mock.calls[0][0]).toContain('l.revoked_at IS NULL AND m.deleted_at IS NULL');
    expect(prepare.mock.calls[1][0]).toContain('p.deleted_at IS NULL');
  });

  it('serves a valid link without a login and prevents caching and indexing', async () => {
    const { env, batch } = setup();
    batch.mockResolvedValue([
      { results: [{ data: JSON.stringify(match), name_a: 'Alice', name_b: 'Bob' }] },
      { results: [{ data: JSON.stringify(point) }] },
    ]);
    const response = await worker.fetch(new Request(`https://example.com/api/public/stats/${'a'.repeat(64)}`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    const data = await response.json() as { nameA: string; nameB: string };
    expect([data.nameA, data.nameB]).toEqual(['Alice', 'Bob']);
  });

  it('strips private identifiers, metadata, and unexpected nested fields', () => {
    const privateServe = { ...point.serves[0], notes: 'Private serve note' };
    const privateRules = { ...match.rules, notes: 'Private rule note' };
    const data = publicStatsData({ ...match, rules: privateRules }, [{ ...point, notes: 'Private point observation', serves: [privateServe] }], 'Alice', 'Bob');
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('Private');
    expect(serialized).not.toContain('private-');
    expect(serialized).not.toContain('owner');
    expect(data.points[0].serves[0]).toEqual({ result: 'ace', location: 'wide', type: 'flat', fault: undefined, return: undefined });
    expect(data.match.rules).toEqual(match.rules);
  });

  it('includes the finalised winner and reason without unexpected fields', () => {
    const finalisation = { winner: 'B' as const, reason: 'player_a_retired' as const, notes: 'Private finalisation note' };
    const data = publicStatsData({ ...match, status: 'completed', finalisation }, [point], 'Alice', 'Bob');
    expect(data.match.finalisation).toEqual({ winner: 'B', reason: 'player_a_retired' });
    expect(JSON.stringify(data)).not.toContain('Private finalisation note');
    expect(data.points).toHaveLength(1);
  });

  it('preserves Lucky ball classification for anonymous stats', () => {
    const data = publicStatsData(match, [{
      ...point, end: 'rally',
      rally: { count: 3, ending: 'server_winner', stroke: 'forehand', lucky: true,
        direction: 'down_the_line', shotType: 'drive_volley', position: 'net' },
    }], 'Alice', 'Bob');
    expect(data.points[0].rally?.lucky).toBe(true);
    const stats = summary(pointContexts(data.match, data.points));
    expect(stats.A.winners).toEqual({ total: 1, aces: 0, returnWinners: 0, rallyWinners: 0 });
    expect(stats.A.pointsWon).toBe(0);
    expect(stats.A.firstServe).toEqual({ served: 0, in: 0, won: 0 });
  });
});