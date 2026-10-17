import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../model/rules';
import type { Match, Point, Side } from '../model/types';
import { firstServeGames, firstServeHoldThresholds, pointContexts, serveLocationImpact, summary } from './matchStats';
import { playerStats, servingTotals } from './playerStats';

const match = (id: string, playerAId: string, playerBId: string): Match => ({
  id, playerAId, playerBId, ruleSetId: 'standard', ruleSetName: 'Standard', rules: DEFAULT_RULES,
  firstServer: 'A', status: 'in_progress', updatedAt: 1,
});
const ace = (id: string, matchId: string, server: Side): Point => ({
  id, matchId, server, winner: server, seq: 0, end: 'ace',
  serves: [{ result: 'ace', location: 'wide', type: 'flat' }], createdAt: 1, updatedAt: 1,
});

describe('aggregate player statistics', () => {
  const filters = { server: 'A' as const, sets: [], sides: [], attempts: [], keyPoints: [], locations: [] };

  it('pools unequal match samples on either side and resets repeat chains at match boundaries', () => {
    const first = { ...match('first', 'player', 'one'), status: 'completed' as const };
    const second = { ...match('second', 'two', 'player'), firstServer: 'B' as const, status: 'completed' as const };
    const points = (record: Match, firstServer: Side, winners: Side[]): Point[] => winners.map((winner, seq) => {
      const server = seq >= 4 && seq < 8 ? 'A' : firstServer;
      return { ...ace(`${record.id}-${seq}`, record.id, server), seq, winner, server,
        end: winner === server ? 'ace' : 'return_winner',
        serves: [{ result: winner === server ? 'ace' : 'in', location: 'wide', type: 'flat' }] };
    });
    const stats = playerStats('player', [{ match: first, points: points(first, 'A', ['A', 'A', 'A', 'A']) },
      { match: second, points: points(second, 'B', ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'A', 'A', 'A', 'A']) }]);
    expect(stats.records[1].match.firstServer).toBe('A');
    expect(stats.records[1].match.playerAId).toBe('player');
    expect(servingTotals(stats.records, filters)).toMatchObject({ held: 2, played: 3, repeats: 8, compared: 8 });
    const cells = serveLocationImpact(stats.contexts, filters);
    expect(cells.reduce((total, cell) => total + cell.won, 0)).toBe(8);
    expect(cells.reduce((total, cell) => total + cell.played, 0)).toBe(12);
    const games = stats.records.flatMap((record) => firstServeGames(record.match, record.contexts));
    expect(games.filter((game) => game.server === 'A')).toHaveLength(3);
    expect(firstServeHoldThresholds(games, 'A')[0].cutoff).toBeNull();
  });

  it('uses each match rules and never completes an unfinished game with another match points', () => {
    const first = match('unfinished', 'player', 'one');
    const second = { ...match('no-ad', 'two', 'player'), firstServer: 'B' as const, rules: { ...DEFAULT_RULES, noAd: true } };
    const stats = playerStats('player', [
      { match: first, points: Array.from({ length: 3 }, (_, seq) => ({ ...ace(`first-${seq}`, first.id, 'A'), seq })) },
      { match: second, points: (['B', 'A', 'B', 'A', 'B', 'A', 'B'] as Side[]).map((winner, seq) => ({
        ...ace(`second-${seq}`, second.id, 'B'), winner, seq, end: winner === 'B' ? 'ace' as const : 'return_winner' as const,
        serves: [{ result: winner === 'B' ? 'ace' as const : 'in' as const, location: 'wide' as const, type: 'flat' as const }],
      })) },
    ]);
    expect(servingTotals(stats.records, filters)).toMatchObject({ held: 1, played: 1, saved: 1, faced: 1 });
    expect(firstServeGames(stats.records[0].match, stats.records[0].contexts)).toEqual([]);
    expect(firstServeGames(stats.records[1].match, stats.records[1].contexts)).toMatchObject([{ server: 'A', held: true, attempts: 7 }]);
    expect(servingTotals([], filters)).toEqual({ held: 0, played: 0, saved: 0, faced: 0, repeats: 0, compared: 0 });
  });

  it('normalizes either match side and combines the existing stats without mixing scoring histories', () => {
    const a = match('first', 'player', 'opponent-1');
    const b = { ...match('second', 'opponent-2', 'player'), rules: { ...DEFAULT_RULES, noAd: true } };
    const records = [{ match: a, points: [ace('a', a.id, 'A')] }, { match: b, points: [ace('b', b.id, 'B')] }];
    const stats = playerStats('player', records);
    expect(stats.matches).toBe(2);
    expect(summary(stats.contexts).A.winners.aces).toBe(2);
    expect(summary(stats.contexts).A.firstServe.served).toBe(2);
    expect(stats.contexts[1].before.points).toEqual({ a: 0, b: 0 });
    expect(stats.contexts[1].point.server).toBe('A');
    expect(stats.contexts[1].side).toBe(pointContexts(b, records[1].points)[0].side);
  });
  it('preserves Lucky ball winner-only semantics and manually finalised results', () => {
    const m: Match = { ...match('final', 'opponent', 'player'), status: 'completed',
      finalisation: { winner: 'B', reason: 'remaining_unrecorded' } };
    const point: Point = { ...ace('lucky', m.id, 'B'), end: 'rally',
      rally: { count: 5, ending: 'server_winner', stroke: 'forehand', lucky: true, direction: 'none', shotType: 'none', position: 'none' } };
    const stats = playerStats('player', [{ match: m, points: [point] }]);
    expect(stats.wins).toBe(1);
    expect(summary(stats.contexts).A.pointsWon).toBe(0);
    expect(summary(stats.contexts).A.winners.total).toBe(1);
    expect(summary(stats.contexts).A.firstServe.served).toBe(0);
  });
  it('excludes deleted/unrelated matches and exposes completed matches with unknown results', () => {
    const m = match('match', 'player', 'opponent');
    const stats = playerStats('player', [
      { match: { ...m, status: 'completed' }, points: [] },
      { match: { ...m, id: 'deleted', deletedAt: 5 }, points: [] },
      { match: match('unrelated', 'x', 'y'), points: [] },
    ]);
    expect(stats).toMatchObject({ matches: 1, wins: 0, losses: 0, undecided: 1 });
  });
});
