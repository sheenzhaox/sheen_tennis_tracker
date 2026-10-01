import Dexie, { type EntityTable } from 'dexie';
import type { Match, Player, RuleSet } from '../model/types';

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type SyncTable = 'players' | 'ruleSets' | 'matches';
export const SYNC_TABLES: SyncTable[] = ['players', 'ruleSets', 'matches'];

export const db = new Dexie('sheen-tennis-tracker') as Dexie & {
  players: EntityTable<Player, 'id'>;
  ruleSets: EntityTable<RuleSet, 'id'>;
  matches: EntityTable<Match, 'id'>;
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
    for (const t of SYNC_TABLES) await tx.table(t).toCollection().modify({ dirty: 1 });
  });

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

export function matchesForPlayer(playerId: string): Promise<Match[]> {
  return db.matches
    .where('playerAId')
    .equals(playerId)
    .or('playerBId')
    .equals(playerId)
    .filter((m) => !m.deletedAt)
    .reverse()
    .sortBy('startedAt');
}
