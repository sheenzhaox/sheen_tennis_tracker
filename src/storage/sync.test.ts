import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canEditPlayer, canSelectPlayer, isListedPlayer } from '../ui/user';
import { syncNow } from './sync';

const store = vi.hoisted(() => {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const meta = new Map<string, unknown>();
  const table = (name: string) => {
    let rows = tables.get(name);
    if (!rows) {
      rows = new Map();
      tables.set(name, rows);
    }
    const records = rows;
    return {
      get: async (id: string) => records.get(id),
      toArray: async () => [...records.values()],
      delete: async (id: string) => { records.delete(id); },
      put: async (row: Record<string, unknown>) => { records.set(String(row.id), row); },
      update: async (id: string, fields: Record<string, unknown>) => {
        const row = records.get(id);
        if (row) records.set(id, { ...row, ...fields });
      },
      where: (key: string) => ({
        equals: (value: unknown) => ({
          toArray: async () => [...records.values()].filter((row) => row[key] === value),
          delete: async () => { for (const [id, row] of records) if (row[key] === value) records.delete(id); },
        }),
      }),
    };
  };
  return { tables, meta, table };
});

vi.mock('./db', () => ({
  SYNC_TABLES: ['players', 'ruleSets', 'matches', 'points'],
  onLocalChange: vi.fn(),
  db: {
    get matches() { return store.table('matches'); },
    get points() { return store.table('points'); },
    get players() { return store.table('players'); },
    table: store.table,
    transaction: async (_mode: string, _tables: unknown[], action: () => Promise<void>) => action(),
    meta: {
      get: async (key: string) => store.meta.has(key) ? { key, value: store.meta.get(key) } : undefined,
      put: async ({ key, value }: { key: string; value: unknown }) => { store.meta.set(key, value); },
    },
  },
}));

vi.mock('./session', () => ({
  getSession: async () => ({ token: 'test-token', user: { id: 'alice', username: 'alice', role: 'user' } }),
  expireSession: vi.fn(),
}));

const user = { id: 'alice', username: 'alice', role: 'user' } as const;
const remotePlayer = (updatedAt = 100) => ({
  kind: 'players', id: 'player', updatedAt, deletedAt: null,
  data: { id: 'player', name: 'Test1', createdAt: 100, updatedAt, ownerId: 'alice' },
});
const response = (records: unknown[], cursor = 500) => new Response(JSON.stringify({
  records, cursor, rejected: [], revoked: [],
}), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  store.tables.clear();
  store.meta.clear();
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => vi.unstubAllGlobals());

describe('sync ownership metadata', () => {
  it('repairs a user-created player when the server timestamp equals the local timestamp', async () => {
    await store.table('players').put({ id: 'player', name: 'Test1', createdAt: 100, updatedAt: 100, dirty: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([remotePlayer()])));

    await syncNow();

    const local = await store.table('players').get('player');
    expect(local?.ownerId).toBe('alice');
    expect(local?.updatedAt).toBe(100);
    if (!local || typeof local.ownerId !== 'string') throw new Error('Player ownership was not repaired.');
    expect(canEditPlayer(user, { id: 'player', name: 'Test1', createdAt: 100, updatedAt: 100, ownerId: local.ownerId })).toBe(true);
  });

  it('preserves newer edits and their dirty flag while applying authoritative ownership', async () => {
    await store.table('players').put({ id: 'player', name: 'Original', updatedAt: 100, dirty: 1 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      await store.table('players').put({ id: 'player', name: 'Edited during sync', updatedAt: 101, dirty: 1 });
      return response([remotePlayer()]);
    }));

    await syncNow();

    expect(await store.table('players').get('player')).toEqual({
      id: 'player', name: 'Edited during sync', updatedAt: 101, dirty: 1, ownerId: 'alice',
    });
  });

  it('keeps genuinely shared and other users’ private players non-editable', async () => {
    await store.table('players').put({ id: 'player', name: 'Test1', createdAt: 100, updatedAt: 100, ownerId: 'alice', dirty: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{ ...remotePlayer(), data: { ...remotePlayer().data, ownerId: undefined } }])));
    await syncNow();
    const shared = { id: 'player', name: 'Test1', createdAt: 100, updatedAt: 100 };
    expect((await store.table('players').get('player'))?.ownerId).toBeUndefined();
    expect(canEditPlayer(user, shared)).toBe(false);
    expect(isListedPlayer(user, shared)).toBe(false);
    expect(canSelectPlayer(user, shared)).toBe(true);
    expect(canEditPlayer(user, { ...shared, ownerId: 'bob' })).toBe(false);
    expect(isListedPlayer(user, { ...shared, ownerId: 'bob' })).toBe(false);
  });

  it('refreshes match ownership and owner name without overwriting equal-timestamp content', async () => {
    await store.table('matches').put({ id: 'match', updatedAt: 100, ownerName: 'Old name', dirty: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{
      kind: 'matches', id: 'match', updatedAt: 100, deletedAt: null,
      data: { id: 'match', ownerId: 'alice', ownerName: 'Alice' },
    }])));
    await syncNow();
    expect(await store.table('matches').get('match')).toEqual({
      id: 'match', updatedAt: 100, ownerId: 'alice', ownerName: 'Alice', dirty: 0,
    });
  });

  it('repairs old cached rows with one full pull, then resumes incremental sync', async () => {
    store.meta.set('cursor', 10_000);
    const fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, _init?: RequestInit) => response([]));
    vi.stubGlobal('fetch', fetch);
    const since = (index: number) => {
      const body = fetch.mock.calls[index][1]?.body;
      if (typeof body !== 'string') throw new Error('Expected a JSON sync request.');
      return JSON.parse(body).since;
    };
    await syncNow();
    expect(since(0)).toBe(0);
    expect(store.meta.get('ownershipMetadataSynced')).toBe(true);
    await syncNow();
    expect(since(1)).toBe(500);
  });

  it('does not mark ownership repair complete when sync fails', async () => {
    store.meta.set('cursor', 10_000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await syncNow();
    expect(store.meta.has('ownershipMetadataSynced')).toBe(false);
    expect(store.meta.get('cursor')).toBe(10_000);
  });

  it('refreshes club/link metadata and notes even without a newer shared profile timestamp', async () => {
    await store.table('players').put({ id: 'player', name: 'Test1', updatedAt: 100, dirty: 0, notes: 'Old shared note', notesUpdatedAt: 50 });
    const r = remotePlayer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{
      ...r, data: { ...r.data, clubIds: ['club'], linkedUserId: 'alice', createdById: 'admin', notes: 'My private note', notesUpdatedAt: 200 },
    }])));
    await syncNow();
    expect(await store.table('players').get('player')).toMatchObject({
      updatedAt: 100, clubIds: ['club'], linkedUserId: 'alice', notes: 'My private note', notesUpdatedAt: 200,
    });
  });

  it('preserves a note edited during sync while accepting a newer shared profile', async () => {
    await store.table('players').put({ id: 'player', name: 'Old profile', updatedAt: 100, dirty: 1, notes: 'Draft', notesUpdatedAt: 300 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      await store.table('players').update('player', { notes: 'Edited during sync', notesUpdatedAt: 301 });
      const r = remotePlayer(500);
      return response([{ ...r, data: { ...r.data, notes: 'Older note', notesUpdatedAt: 200, clubIds: [] } }]);
    }));
    await syncNow();
    expect(await store.table('players').get('player')).toMatchObject({
      name: 'Test1', updatedAt: 500, notes: 'Edited during sync', notesUpdatedAt: 301, dirty: 1, notesOnly: true,
    });
  });

  it('removes formerly privileged private profile fields when only a match-name reference is authorized', async () => {
    await store.table('players').put({ id: 'player', name: 'Private opponent', updatedAt: 100, dirty: 0, gender: 'female', email: 'private@example.com', rating: 'Private rating', notes: 'Old private note' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{
      kind: 'players', id: 'player', updatedAt: 100, deletedAt: null,
      data: { id: 'player', name: 'Private opponent', ownerId: 'bob', referenceOnly: true, notes: '', notesUpdatedAt: 0, clubIds: [] },
    }])));
    await syncNow();
    const row = await store.table('players').get('player');
    expect(row).toMatchObject({ name: 'Private opponent', referenceOnly: true, notes: '' });
    expect(row?.email).toBeUndefined();
    expect(row?.rating).toBeUndefined();
    expect(row?.gender).toBeUndefined();
  });

  it('purges removed club access and refreshes session permissions without dropping an unsynced own match', async () => {
    await store.table('matches').put({ id: 'club-match', updatedAt: 100, ownerId: 'bob', dirty: 0 });
    await store.table('points').put({ id: 'point', matchId: 'club-match', updatedAt: 100 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      await store.table('matches').put({ id: 'own-new', updatedAt: 100, ownerId: 'alice', dirty: 1 });
      return new Response(JSON.stringify({
        records: [], cursor: 500, rejected: [], revoked: [], visibleMatchIds: [], visiblePlayerIds: [],
        user: { ...user, name: 'Alice Example', email: 'alice@example.com', role: 'coach', clubIds: [] }, accessRevision: 3,
      }));
    }));
    await syncNow();
    expect(await store.table('matches').get('club-match')).toBeUndefined();
    expect(await store.table('points').get('point')).toBeUndefined();
    expect(await store.table('matches').get('own-new')).toBeDefined();
    expect(store.meta.get('session')).toMatchObject({ user: { name: 'Alice Example', email: 'alice@example.com', role: 'coach', clubIds: [] } });
    expect(store.meta.get('accessRevision')).toBe(3);
  });
});
