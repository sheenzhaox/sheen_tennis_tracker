import Dexie, { type EntityTable } from 'dexie';
import type { Match, Player, RuleSet } from '../model/types';

export const db = new Dexie('sheen-tennis-tracker') as Dexie & {
  players: EntityTable<Player, 'id'>;
  ruleSets: EntityTable<RuleSet, 'id'>;
  matches: EntityTable<Match, 'id'>;
};

db.version(1).stores({
  players: 'id, name',
  ruleSets: 'id, name',
  matches: 'id, status, startedAt, playerAId, playerBId',
});

export const newId = () => crypto.randomUUID();

export function matchesForPlayer(playerId: string): Promise<Match[]> {
  return db.matches
    .where('playerAId')
    .equals(playerId)
    .or('playerBId')
    .equals(playerId)
    .reverse()
    .sortBy('startedAt');
}
