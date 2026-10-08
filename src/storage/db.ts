import Dexie, { type EntityTable } from 'dexie';
import type { Club, FinaliseReason, Match, Player, Point, RuleSet, Side } from '../model/types';
import { finalisedMatch } from '../model/match';

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type SyncTable = 'players' | 'ruleSets' | 'matches' | 'points' | 'clubs';
export const SYNC_TABLES: SyncTable[] = ['players', 'ruleSets', 'matches', 'points', 'clubs'];

export const db = new Dexie('sheen-tennis-tracker') as Dexie & {
  players: EntityTable<Player, 'id'>;
  ruleSets: EntityTable<RuleSet, 'id'>;
  matches: EntityTable<Match, 'id'>;
  points: EntityTable<Point, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
  clubs: EntityTable<Club, 'id'>;
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

db.version(4).stores({ clubs: 'id, name, dirty' }).upgrade(async (tx) => {
  const session = (await tx.table<MetaEntry>('meta').get('session'))?.value as { user?: { id: string; role: string } } | undefined;
  await tx.table<Player>('players').toCollection().modify((player) => {
    if (player.notes !== undefined) {
      if (player.ownerId === session?.user?.id || (player.dirty && session?.user?.id)) {
        player.notesUpdatedAt = player.updatedAt;
      } else {
        delete player.notes;
        player.notesUpdatedAt = 0;
      }
    }
  });
  await tx.table('meta').bulkDelete(['cursor', 'accessRevision']);
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

export async function savePlayerNote(player: Player, notes: string): Promise<void> {
  await db.players.put({ ...player, notes, notesUpdatedAt: Date.now(), notesOnly: true, dirty: 1 });
  changeListeners.forEach((fn) => fn());
}

export async function deleteRecord(table: SyncTable, id: string): Promise<void> {
  const now = Date.now();
  const tombstone = { deletedAt: now, updatedAt: now, dirty: 1 as const };
  if (table === 'matches') {
    await db.transaction('rw', db.matches, db.points, async () => {
      if (!await db.matches.update(id, tombstone)) throw new Error('Match not found.');
      await db.points.where('matchId').equals(id).modify(tombstone);
    });
  } else {
    await db.table(table).update(id, tombstone);
  }
  changeListeners.forEach((fn) => fn());
}

export async function finaliseMatch(id: string, winner: Side, reason: FinaliseReason): Promise<void> {
  await db.transaction('rw', db.matches, async () => {
    const match = await db.matches.get(id);
    if (!match) throw new Error('Match not found.');
    await db.matches.put({ ...finalisedMatch(match, winner, reason, Date.now()), dirty: 1 });
  });
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
