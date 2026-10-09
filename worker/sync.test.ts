import { describe, expect, it, vi } from 'vitest';
import { canWriteMatch, canWritePlayer, sync } from './sync';
import type { User } from './http';

const admin = { id: 'admin', username: 'admin', role: 'admin' } as User;
const alice = { id: 'alice', username: 'alice', role: 'user' } as User;
const live = { deletedAt: null };
const deleted = { deletedAt: 1 };

describe('canWriteMatch', () => {
  it('allows users to save and delete their own matches, including unsynced matches', () => {
    for (const record of [live, deleted]) {
      expect(canWriteMatch(alice, record, undefined)).toBe(true);
      expect(canWriteMatch(alice, record, { owner_id: 'alice', deleted_at: null })).toBe(true);
    }
  });

  it('rejects edits and deletes of matches belonging to another user, even if shared', () => {
    for (const record of [live, deleted]) {
      expect(canWriteMatch(alice, record, { owner_id: 'bob', deleted_at: null })).toBe(false);
      expect(canWriteMatch(alice, record, { owner_id: null, deleted_at: null })).toBe(false);
    }
  });

  it('allows repeated tombstones but does not let a user resurrect a deleted match', () => {
    const server = { owner_id: 'alice', deleted_at: 1 };
    expect(canWriteMatch(alice, deleted, server)).toBe(true);
    expect(canWriteMatch(alice, live, server)).toBe(false);
  });

  it('preserves admin match management', () => {
    expect(canWriteMatch(admin, deleted, { owner_id: 'alice', deleted_at: null })).toBe(true);
  });
});

describe('canWritePlayer', () => {
  it('lets users add new players but not create already-deleted ones', () => {
    expect(canWritePlayer(alice, live, undefined, false)).toBe(true);
    expect(canWritePlayer(alice, deleted, undefined, false)).toBe(false);
  });

  function syncDatabase() {
    const bind = vi.fn();
    const statement = { bind, first: vi.fn().mockResolvedValue({ revision: 1 }), all: vi.fn().mockResolvedValue({ results: [] }), run: vi.fn(), raw: vi.fn() };
    bind.mockReturnValue(statement);
    const prepare = vi.fn().mockReturnValue(statement);
    const batch = vi.fn().mockImplementation(async (statements: D1PreparedStatement[]) => statements.map(() => ({ results: [] })));
    const db: D1Database = { prepare, batch, exec: vi.fn(), withSession: vi.fn(), dump: vi.fn() };
    return { db, bind };
  }
  const playerRequest = (data: object) => new Request('https://example.com/api/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ kind: 'players', id: 'draft', updatedAt: 10, deletedAt: null, data: { id: 'draft', name: 'Sam', ...data } }] }),
  });

  describe('name-only player sync', () => {
    it.each([alice, admin])('accepts name-only players private to $username', async (user) => {
      const { db, bind } = syncDatabase();
      const response = await sync(playerRequest({ ownerId: user.id }), db, user);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ rejected: [] });
      expect(bind).toHaveBeenCalledWith('draft', 10, null, expect.any(Number), expect.any(String), user.id, user.id);
    });

    it('preserves system-level creation from the admin Players form', async () => {
      const { db, bind } = syncDatabase();
      await sync(playerRequest({ gender: 'male' }), db, admin);
      expect(bind).toHaveBeenCalledWith('draft', 10, null, expect.any(Number), expect.any(String), null, admin.id);
    });

    it('does not let a normal user choose someone else as the new player owner', async () => {
      const { db, bind } = syncDatabase();
      await sync(playerRequest({ ownerId: 'bob' }), db, alice);
      expect(bind).toHaveBeenCalledWith('draft', 10, null, expect.any(Number), expect.any(String), alice.id, alice.id);
    });

    it.each(['', 'unknown', null, 123])('still rejects an invalid provided gender: %s', async (gender) => {
      const { db, bind } = syncDatabase();
      const response = await sync(playerRequest({ gender }), db, alice);
      const body = await response.json() as { rejected: { id: string; reason: string }[] };
      expect(body.rejected).toMatchObject([{ id: 'draft', reason: expect.stringContaining('Male/Female') }]);
      expect(bind.mock.calls.some((args) => args[0] === 'draft' && args.length === 7)).toBe(false);
    });
  });

  it('lets users edit and delete only their own players', () => {
    const own = { owner_id: 'alice', deleted_at: null };
    expect(canWritePlayer(alice, live, own, false)).toBe(true);
    expect(canWritePlayer(alice, deleted, own, false)).toBe(true);
    expect(canWritePlayer(alice, live, { owner_id: 'bob', deleted_at: null }, false)).toBe(false);
    expect(canWritePlayer(alice, deleted, { owner_id: 'bob', deleted_at: null }, false)).toBe(false);
  });

  it('keeps admin-added (shared) players read-only for users', () => {
    const shared = { owner_id: null, deleted_at: null };
    expect(canWritePlayer(alice, live, shared, false)).toBe(false);
    expect(canWritePlayer(alice, deleted, shared, false)).toBe(false);
  });

  it('blocks deleting a player used in a match and reviving a deleted player', () => {
    expect(canWritePlayer(alice, deleted, { owner_id: 'alice', deleted_at: null }, true)).toBe(false);
    expect(canWritePlayer(alice, live, { owner_id: 'alice', deleted_at: 5 }, false)).toBe(false);
  });

  it('lets admins write any player', () => {
    expect(canWritePlayer(admin, live, { owner_id: null, deleted_at: null }, false)).toBe(true);
    expect(canWritePlayer(admin, deleted, undefined, false)).toBe(true);
  });
});
