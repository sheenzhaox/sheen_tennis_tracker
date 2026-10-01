import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../storage/db';
import { subscribeSync, type SyncState } from '../storage/sync';
import { BUILT_IN_RULE_SETS } from '../model/rules';
import type { Player, RuleSet } from '../model/types';

export function useAllRuleSets(): RuleSet[] {
  const custom =
    useLiveQuery(() => db.ruleSets.orderBy('name').filter((r) => !r.deletedAt).toArray(), []) ?? [];
  return [...BUILT_IN_RULE_SETS, ...custom];
}

export function usePlayers(): Player[] | undefined {
  return useLiveQuery(() => db.players.orderBy('name').filter((p) => !p.deletedAt).toArray(), []);
}

export function usePlayerNames(): Map<string, string> {
  const players = usePlayers() ?? [];
  return new Map(players.map((p) => [p.id, p.name]));
}

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>({ status: 'idle' });
  useEffect(() => subscribeSync(setState), []);
  return state;
}

export function usePendingCount(): number {
  return (
    useLiveQuery(async () => {
      const counts = await Promise.all([
        db.players.where('dirty').equals(1).count(),
        db.ruleSets.where('dirty').equals(1).count(),
        db.matches.where('dirty').equals(1).count(),
      ]);
      return counts.reduce((a, b) => a + b, 0);
    }, []) ?? 0
  );
}
