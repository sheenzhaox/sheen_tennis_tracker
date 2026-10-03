import { describe, expect, it } from 'vitest';
import {
  errorTypeStats,
  pointContexts,
  rallyWinnerStats,
  serveLocationStats,
  shotTypeStats,
  strokeStats,
  summary,
} from './matchStats';
import { DEFAULT_RULES } from '../model/rules';
import type { Match, Point, RallyDetail, Serve, Side } from '../model/types';

const match: Match = {
  id: 'm',
  playerAId: 'a',
  playerBId: 'b',
  ruleSetId: 'r',
  ruleSetName: 'r',
  rules: DEFAULT_RULES,
  firstServer: 'A',
  status: 'in_progress',
  updatedAt: 0,
};

let seq = 0;
const serve = (result: Serve['result'], extra: Partial<Serve> = {}): Serve => ({ result, location: 'none', type: 'none', ...extra });
const point = (server: Side, winner: Side, end: Point['end'], serves: Serve[], rally?: RallyDetail): Point => ({
  id: String(seq),
  matchId: 'm',
  seq: seq++,
  server,
  winner,
  serves,
  end,
  rally,
  createdAt: 0,
  updatedAt: 0,
});
const rally = (ending: RallyDetail['ending'], extra: Partial<RallyDetail> = {}): RallyDetail => ({
  count: null,
  ending,
  stroke: 'none',
  direction: 'none',
  shotType: 'none',
  position: 'none',
  ...extra,
});

// A serves the first game: ace (T), DF (net), return winner by B, rally FH winner by A, rally BH error by B (long), A wins game.
const points: Point[] = [
  point('A', 'A', 'ace', [serve('ace', { location: 't' })]),
  point('A', 'B', 'double_fault', [serve('fault', { location: 'wide', fault: 'long' }), serve('fault', { location: 'body', fault: 'net' })]),
  point('A', 'B', 'return_winner', [serve('return_winner', { location: 'wide', return: { stroke: 'forehand', direction: 'crosscourt' } })]),
  point('A', 'A', 'rally', [serve('in', { location: 't' })], rally('server_winner', { count: 3, stroke: 'forehand', shotType: 'topspin' })),
  point('A', 'A', 'rally', [serve('fault'), serve('in', { location: 'body' })], rally('returner_error', { count: 9, stroke: 'backhand', shotType: 'slice', position: 'baseline', error: 'long' })),
  point('A', 'A', 'unrecorded', []),
];

describe('match stats', () => {
  const ctxs = pointContexts(match, points);

  it('tags side and game situations', () => {
    expect(ctxs.map((c) => c.side)).toEqual(['deuce', 'ad', 'deuce', 'ad', 'deuce', 'ad']);
    expect([...ctxs[0].situations]).toEqual(['first']);
    // Before point 6 the score is 40-30 to the server.
    expect(ctxs[5].situations.has('game')).toBe(true);
  });

  it('counts winners and unforced errors', () => {
    const s = summary(ctxs);
    expect(s.A.winners).toEqual({ total: 2, aces: 1, returnWinners: 0, rallyWinners: 1 });
    expect(s.B.winners).toEqual({ total: 1, aces: 0, returnWinners: 1, rallyWinners: 0 });
    expect(s.A.errors).toEqual({ total: 1, doubleFaults: 1, returnErrors: 0, rallyErrors: 0 });
    expect(s.B.errors).toEqual({ total: 1, doubleFaults: 0, returnErrors: 0, rallyErrors: 1 });
    expect(s.A.pointsWon).toBe(4);
    expect(s.A.firstServe).toEqual({ served: 5, in: 3, won: 2 });
    expect(s.A.secondServe).toEqual({ served: 2, won: 1 });
  });

  it('serve location with side and situation filters', () => {
    const all = serveLocationStats(ctxs, 'A', 'all', 'all');
    expect(all.t.first).toEqual({ count: 2, in: 2, won: 2 });
    expect(all.body.second).toEqual({ count: 2, in: 1, won: 1 });
    const deuce = serveLocationStats(ctxs, 'A', 'deuce', 'all');
    expect(deuce.t.first.count).toBe(1);
    const first = serveLocationStats(ctxs, 'A', 'all', 'first');
    expect(first.t.first.count).toBe(1);
    expect(first.wide.first.count).toBe(0);
  });

  it('forehand / backhand by game type', () => {
    const byLabel = (rows: ReturnType<typeof strokeStats>) => Object.fromEntries(rows.map((r) => [r.label.split(' (')[0], r]));
    const allA = byLabel(strokeStats(ctxs, 'A', 'all'));
    expect(allA['Winners']).toMatchObject({ total: 2, forehand: 1, backhand: 0 });
    expect(allA['Unforced errors'].total).toBe(1);
    expect(allA['Short rally winners'].total).toBe(2);
    const allB = byLabel(strokeStats(ctxs, 'B', 'all'));
    expect(allB['Winners']).toMatchObject({ total: 1, forehand: 1 });
    expect(allB['Long rally UE']).toMatchObject({ total: 1, backhand: 1 });

    const serveA = byLabel(strokeStats(ctxs, 'A', 'serve'));
    expect(serveA['Aces']).toMatchObject({ total: 1, forehand: null });
    expect(serveA['Double faults'].total).toBe(1);
    expect(serveA['Serve +1']).toMatchObject({ total: 1, forehand: 1 });
    expect(serveA['Serve advantage'].total).toBe(2);
    expect(serveA['Serve disadvantage']).toMatchObject({ total: 1, forehand: 1 });

    const returnB = byLabel(strokeStats(ctxs, 'B', 'return'));
    expect(returnB['Return aces']).toMatchObject({ total: 1, forehand: 1 });
    expect(returnB['Return advantage'].total).toBe(1);
    expect(strokeStats(ctxs, 'A', 'return').every((r) => r.total === 0)).toBe(true);
  });

  it('rally winners by direction and shot type', () => {
    const fh = rallyWinnerStats(ctxs, 'forehand');
    expect(fh.direction.A.middle).toBe(1);
    expect(fh.shotType.A.topspin).toBe(1);
    expect(rallyWinnerStats(ctxs, 'backhand').direction.A.middle).toBe(0);
  });

  it('shot types and error breakdown', () => {
    expect(shotTypeStats(ctxs).A.topspin.winners).toBe(1);
    expect(shotTypeStats(ctxs).B.slice.errors).toBe(1);
    const all = errorTypeStats(ctxs, 'all', 'all');
    expect(all.A.net).toBe(1);
    expect(all.B.long).toBe(1);
    expect(errorTypeStats(ctxs, 'forehand', 'all').A.net).toBe(0);
    expect(errorTypeStats(ctxs, 'backhand', 'baseline').B.long).toBe(1);
    expect(errorTypeStats(ctxs, 'backhand', 'net').B.long).toBe(0);
    // Double fault: no stroke filter, position defaults to baseline.
    expect(errorTypeStats(ctxs, 'all', 'baseline').A.net).toBe(1);
  });
});
