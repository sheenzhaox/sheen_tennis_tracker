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
      put: async (row: Record<string, unknown>) => { records.set(String(row.id), row); },
      update: async (id: string, fields: Record<string, unknown>) => {
        const row = records.get(id);
        if (row) records.set(id, { ...row, ...fields });
      },
      where: (key: string) => ({
        equals: (value: unknown) => ({
          toArray: async () => [...records.values()].filter((row) => row[key] === value),
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
});
