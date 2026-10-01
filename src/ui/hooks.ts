import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../storage/db';
import { BUILT_IN_RULE_SETS } from '../model/rules';
import type { Player, RuleSet } from '../model/types';

export function useAllRuleSets(): RuleSet[] {
  const custom = useLiveQuery(() => db.ruleSets.orderBy('name').toArray(), []) ?? [];
  return [...BUILT_IN_RULE_SETS, ...custom];
}

export function usePlayers(): Player[] | undefined {
  return useLiveQuery(() => db.players.orderBy('name').toArray(), []);
}

export function usePlayerNames(): Map<string, string> {
  const players = usePlayers() ?? [];
  return new Map(players.map((p) => [p.id, p.name]));
}
