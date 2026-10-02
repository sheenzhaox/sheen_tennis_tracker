import { describe, expect, it } from 'vitest';
import {
  errorBreakdown,
  pointContexts,
  rallyStrokeStats,
  serveLocationStats,
  shotTypeStats,
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

  it('rally strokes by length', () => {
    expect(rallyStrokeStats(ctxs, 'all').A.forehand.winners).toBe(1);
    expect(rallyStrokeStats(ctxs, 'short').B.backhand.errors).toBe(0);
    expect(rallyStrokeStats(ctxs, 'long').B.backhand.errors).toBe(1);
  });

  it('shot types and error breakdown', () => {
    expect(shotTypeStats(ctxs).A.topspin.winners).toBe(1);
    expect(shotTypeStats(ctxs).B.slice.errors).toBe(1);
    const e = errorBreakdown(ctxs);
    expect(e.A.stroke.serve).toBe(1);
    expect(e.A.type.net).toBe(1);
    expect(e.B.stroke.backhand).toBe(1);
    expect(e.B.position.baseline).toBe(1);
    expect(e.B.type.long).toBe(1);
  });
});
