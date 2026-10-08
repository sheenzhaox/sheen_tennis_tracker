import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../model/rules';
import type { Match, Point, Side } from '../model/types';
import { pointContexts, summary } from './matchStats';
import { playerStats } from './playerStats';

const match = (id: string, playerAId: string, playerBId: string): Match => ({
  id, playerAId, playerBId, ruleSetId: 'standard', ruleSetName: 'Standard', rules: DEFAULT_RULES,
  firstServer: 'A', status: 'in_progress', updatedAt: 1,
});
const ace = (id: string, matchId: string, server: Side): Point => ({
  id, matchId, server, winner: server, seq: 0, end: 'ace',
  serves: [{ result: 'ace', location: 'wide', type: 'flat' }], createdAt: 1, updatedAt: 1,
});

describe('aggregate player statistics', () => {
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
