import { describe, expect, it, vi } from 'vitest';
import type { Match, Point } from '../src/model/types';
import worker from './index';
import { getPublicStats, hashStatsToken, manageStatsLink, publicStatsData } from './publicStats';
import type { Env, User } from './http';

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
  const run = vi.fn().mockResolvedValue({ success: true });
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
  it('creates a random token unrelated to the match ID and persists only its hash', async () => {
    const { env, bind } = setup();
    const response = await manageStatsLink(new Request('https://example.com', { method: 'POST' }), env, owner, match.id);
    const data = await response.json() as { token: string; active: boolean };
    expect(data.token).toMatch(/^[a-f0-9]{64}$/);
    expect(data.token).not.toContain(match.id);
    expect(data.active).toBe(true);
    expect(bind).toHaveBeenLastCalledWith(match.id, await hashStatsToken(data.token), expect.any(Number));
    expect(bind.mock.calls.flat()).not.toContain(data.token);
  });

  it('denies creation, status lookup, and revocation by a view-only user', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const { env, run } = setup();
      const response = await manageStatsLink(new Request('https://example.com', { method }), env, { ...owner, id: 'viewer' }, match.id);
      expect(response.status).toBe(403);
      expect(run).not.toHaveBeenCalled();
    }
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
    const data = publicStatsData({ ...match, rules: privateRules }, [{ ...point, serves: [privateServe] }], 'Alice', 'Bob');
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('Private');
    expect(serialized).not.toContain('private-');
    expect(serialized).not.toContain('owner');
    expect(data.points[0].serves[0]).toEqual({ result: 'ace', location: 'wide', type: 'flat', fault: undefined, return: undefined });
    expect(data.match.rules).toEqual(match.rules);
  });
});