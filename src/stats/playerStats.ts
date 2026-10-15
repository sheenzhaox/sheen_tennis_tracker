import { computeScore, other } from '../engine/score';
import type { Match, Point } from '../model/types';
import { pointContexts, type PointContext } from './matchStats';

export interface RecordedMatch { match: Match; points: Point[] }

export function playerStats(playerId: string, records: RecordedMatch[]): {
  contexts: PointContext[]; matches: number; wins: number; losses: number; undecided: number;
} {
  const contexts: PointContext[] = [];
  const result = { contexts, matches: 0, wins: 0, losses: 0, undecided: 0 };
  for (const { match, points } of records) {
    if (match.deletedAt || (match.playerAId !== playerId && match.playerBId !== playerId)) continue;
    result.matches++;
    const side = match.playerAId === playerId ? 'A' : 'B';
    if (match.status === 'completed') {
      const winner = match.finalisation?.winner ?? computeScore(match.rules, match.firstServer ?? 'A', points.map((point) => point.winner)).winner;
      if (!winner) result.undecided++;
      else if (winner === side) result.wins++;
      else result.losses++;
    }
    if (side === 'A') result.contexts.push(...pointContexts(match, points));
    else result.contexts.push(...pointContexts(
      { ...match, playerAId: match.playerBId, playerBId: match.playerAId, firstServer: other(match.firstServer ?? 'A') },
      points.map((point) => ({ ...point, server: other(point.server), winner: other(point.winner) })),
    ));
  }
  return result;
}
