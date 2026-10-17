import { computeScore, other } from '../engine/score';
import type { Match, Point } from '../model/types';
import { breakPointsSaved, locationRepeats, pointContexts, serviceGamesHeld, type PointContext, type ServeFilters } from './matchStats';

export interface RecordedMatch { match: Match; points: Point[] }
export interface MatchContexts { match: Match; contexts: PointContext[] }

export function servingTotals(records: MatchContexts[], filters: ServeFilters) {
  return records.reduce((total, { match, contexts }) => {
    const held = serviceGamesHeld(match, contexts, filters);
    const breaks = breakPointsSaved(contexts, filters);
    const repeats = locationRepeats(contexts, filters);
    return { held: total.held + held.held, played: total.played + held.played,
      saved: total.saved + breaks.saved, faced: total.faced + breaks.faced,
      repeats: total.repeats + repeats.repeats, compared: total.compared + repeats.compared };
  }, { held: 0, played: 0, saved: 0, faced: 0, repeats: 0, compared: 0 });
}

export function playerStats(playerId: string, records: RecordedMatch[]): {
  contexts: PointContext[]; records: MatchContexts[]; matches: number; wins: number; losses: number; undecided: number;
} {
  const contexts: PointContext[] = [];
  const result = { contexts, records: [] as MatchContexts[], matches: 0, wins: 0, losses: 0, undecided: 0 };
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
    const normalizedMatch: Match = side === 'A' ? match : {
      ...match, playerAId: match.playerBId, playerBId: match.playerAId, firstServer: other(match.firstServer ?? 'A'),
      finalisation: match.finalisation ? { ...match.finalisation, winner: other(match.finalisation.winner) } : undefined,
    };
    const normalizedPoints = side === 'A' ? points : points.map((point) => ({ ...point, server: other(point.server), winner: other(point.winner) }));
    const matchContexts = pointContexts(normalizedMatch, normalizedPoints);
    result.contexts.push(...matchContexts);
    result.records.push({ match: normalizedMatch, contexts: matchContexts });
  }
  return result;
}
