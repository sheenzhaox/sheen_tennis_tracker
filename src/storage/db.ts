import Dexie, { type EntityTable } from 'dexie';
import type { Match, Player, Point, RuleSet } from '../model/types';

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type SyncTable = 'players' | 'ruleSets' | 'matches' | 'points';
export const SYNC_TABLES: SyncTable[] = ['players', 'ruleSets', 'matches', 'points'];

export const db = new Dexie('sheen-tennis-tracker') as Dexie & {
  players: EntityTable<Player, 'id'>;
  ruleSets: EntityTable<RuleSet, 'id'>;
  matches: EntityTable<Match, 'id'>;
  points: EntityTable<Point, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

db.version(1).stores({
  players: 'id, name',
  ruleSets: 'id, name',
  matches: 'id, status, startedAt, playerAId, playerBId',
});

db.version(2)
  .stores({
    players: 'id, name, dirty',
    ruleSets: 'id, name, dirty',
    matches: 'id, status, startedAt, playerAId, playerBId, dirty',
    meta: 'key',
  })
  .upgrade(async (tx) => {
    for (const t of ['players', 'ruleSets', 'matches']) await tx.table(t).toCollection().modify({ dirty: 1 });
  });

db.version(3).stores({
  points: 'id, matchId, dirty',
});

export async function pointsForMatch(matchId: string): Promise<Point[]> {
  const points = await db.points.where('matchId').equals(matchId).filter((p) => !p.deletedAt).toArray();
  return points.sort((x, y) => x.seq - y.seq || x.createdAt - y.createdAt);
}

export const newId = () => crypto.randomUUID();

const changeListeners = new Set<() => void>();
export function onLocalChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export async function saveRecord<T extends { id: string }>(table: SyncTable, record: T): Promise<void> {
  await db.table(table).put({ ...record, updatedAt: Date.now(), dirty: 1 });
  changeListeners.forEach((fn) => fn());
}

export async function deleteRecord(table: SyncTable, id: string): Promise<void> {
  const now = Date.now();
  await db.table(table).update(id, { deletedAt: now, updatedAt: now, dirty: 1 });
  changeListeners.forEach((fn) => fn());
}

export const isLive = <T extends { deletedAt?: number }>(r: T | undefined): r is T => !!r && !r.deletedAt;

export async function countDirty(): Promise<number> {
  const counts = await Promise.all(SYNC_TABLES.map((t) => db.table(t).where('dirty').equals(1).count()));
  return counts.reduce((a, b) => a + b, 0);
}

/** Wipes all synced data and settings on this device (used when switching account). */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.meta], async () => {
    await Promise.all([...SYNC_TABLES.map((t) => db.table(t).clear()), db.meta.clear()]);
  });
}

export async function matchesForPlayer(playerId: string): Promise<Match[]> {
  const matches = await db.matches
    .where('playerAId')
    .equals(playerId)
    .or('playerBId')
    .equals(playerId)
    .filter((m) => !m.deletedAt)
    .toArray();
  const key = (m: Match) => m.startedAt ?? m.createdAt ?? m.updatedAt;
  return matches.sort((x, y) => key(y) - key(x));
}
