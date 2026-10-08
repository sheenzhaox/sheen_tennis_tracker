import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { countDirty, db } from '../storage/db';
import { subscribeSync, type SyncState } from '../storage/sync';
import type { Session } from '../storage/session';
import { BUILT_IN_RULE_SETS } from '../model/rules';
import type { Player, RuleSet } from '../model/types';
import { isListedPlayer, useUser } from './user';

export function useAllRuleSets(): RuleSet[] {
  const custom =
    useLiveQuery(() => db.ruleSets.orderBy('name').filter((r) => !r.deletedAt).toArray(), []) ?? [];
  return [...BUILT_IN_RULE_SETS, ...custom];
}

/** All synced players, including other users' private players referenced by visible matches. */
export function useAllPlayers(): Player[] | undefined {
  return useLiveQuery(() => db.players.orderBy('name').filter((p) => !p.deletedAt).toArray(), []);
}

/** Manageable players shown in the signed-in user's Players page. */
export function usePlayers(): Player[] | undefined {
  const user = useUser();
  return useAllPlayers()?.filter((p) => isListedPlayer(user, p));
}

export function usePlayerNames(): Map<string, string> {
  const players = useAllPlayers() ?? [];
  return new Map(players.map((p) => [p.id, p.name]));
}

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>({ status: 'idle' });
  useEffect(() => subscribeSync(setState), []);
  return state;
}

export function usePendingCount(): number {
  return useLiveQuery(countDirty, []) ?? 0;
}

/** undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  return useLiveQuery(async () => ((await db.meta.get('session'))?.value as Session | undefined) ?? null, []);
}
