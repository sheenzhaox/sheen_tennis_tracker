import { describe, expect, it } from 'vitest';
import {
  breakPointsSaved,
  errorTypeStats,
  errorDirectionStats,
  filterSets,
  locationRepeats,
  pointContexts,
  pointPhase,
  rallyWinnerStats,
  serveDistribution,
  serveFaults,
  serveImpact,
  serveImpactStats,
  servePerformance,
  serviceGamesHeld,
  setOptions,
  shotTypeStats,
  strokeStats,
  summary,
  type ServeFilters,
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

  it('forehand / backhand by game type', () => {
    const byLabel = (rows: ReturnType<typeof strokeStats>) => Object.fromEntries(rows.map((r) => [r.label.split(' (')[0], r]));
    const allA = byLabel(strokeStats(ctxs, 'A', 'all'));
    expect(allA['Winners']).toMatchObject({ total: 2, forehand: 1, backhand: 0 });
    expect(allA['Unforced errors'].total).toBe(1);
    expect(allA['Serve-phase winners'].total).toBe(2);
    const allB = byLabel(strokeStats(ctxs, 'B', 'all'));
    expect(allB['Winners']).toMatchObject({ total: 1, forehand: 1 });
    expect(allB['Neutralised UE']).toMatchObject({ total: 1, backhand: 1 });

    const serveA = byLabel(strokeStats(ctxs, 'A', 'serve'));
    expect(serveA['Aces']).toMatchObject({ total: 1, forehand: null });
    expect(serveA['Double faults'].total).toBe(1);
    expect(serveA['Serve +1 winners']).toMatchObject({ total: 1, forehand: 1 });
    expect(serveA['Serve advantage']).toMatchObject({ total: 2, forehand: 1, backhand: 0 });
    expect(serveA['Serve disadvantage']).toMatchObject({ total: 2, forehand: 1, backhand: 0 });

    const returnB = byLabel(strokeStats(ctxs, 'B', 'return'));
    expect(returnB['Return aces']).toMatchObject({ total: 1, forehand: 1 });
    expect(returnB['Return advantage'].total).toBe(1);
    expect(strokeStats(ctxs, 'A', 'return').every((r) => r.total === 0)).toBe(true);
  });

  it('uses the recorded serve impact and maps legacy rally counts', () => {
    const r = (ending: RallyDetail['ending'], extra: Partial<RallyDetail>) => point('A', 'A', 'rally', [serve('in')], rally(ending, extra));
    expect(serveImpact(r('returner_winner', { impact: 'serve_advantage', count: 9 }))).toBe('serve_advantage');
    expect(serveImpact(r('server_winner', { count: 3 }))).toBe('serve_plus_one');
    expect(serveImpact(r('server_error', { count: 3 }))).toBe('serve_advantage');
    expect(serveImpact(r('returner_winner', { count: 6 }))).toBe('serve_disadvantage');
    expect(serveImpact(r('server_winner', { count: 7 }))).toBe('neutralised');
    for (const count of [null, 0, 2]) expect(serveImpact(r('server_winner', { count }))).toBeNull();
    expect(serveImpact(r('server_winner', { impact: 'none' }))).toBeNull();
    expect(pointPhase(point('A', 'B', 'double_fault', [serve('fault'), serve('fault')]))).toBe('serve');
    expect(pointPhase(r('server_winner', { impact: 'neutralised' }))).toBe('neutralised');
    expect(pointPhase(r('server_winner', {}))).toBeNull();
  });

  it('counts serve-impact rows from recorded states', () => {
    const r = (winner: Side, ending: RallyDetail['ending'], impact: RallyDetail['impact']) =>
      point('A', winner, 'rally', [serve('in')], rally(ending, { impact, stroke: 'forehand' }));
    const contexts = pointContexts(match, [
      r('A', 'server_winner', 'serve_plus_one'),
      r('A', 'server_winner', 'serve_advantage'),
      r('B', 'returner_winner', 'serve_disadvantage'),
      r('B', 'server_error', 'serve_advantage'),
      r('A', 'server_winner', 'neutralised'),
      r('A', 'server_winner', 'none'),
      r('A', 'returner_error', 'serve_advantage'),
      r('A', 'server_winner', 'serve_disadvantage'),
      r('B', 'server_error', 'serve_disadvantage'),
      point('A', 'B', 'double_fault', [serve('fault'), serve('fault')]),
      point('A', 'A', 'return_error', [serve('return_error', { return: { stroke: 'backhand', direction: 'none' } })]),
    ]);
    const byLabel = (rows: ReturnType<typeof strokeStats>) => Object.fromEntries(rows.map((row) => [row.label.split(' (')[0], row.total]));
    expect(byLabel(strokeStats(contexts, 'A', 'serve'))).toMatchObject({
      'Serve +1 winners': 1, 'Serve advantage': 4, 'Serve disadvantage': 3,
    });
    // Errors count in the total but their strokes belong to the other player.
    const serveRows = strokeStats(contexts, 'A', 'serve');
    expect(serveRows.find((row) => row.label.startsWith('Serve advantage'))).toMatchObject({ forehand: 2, backhand: 0 });
    expect(serveRows.find((row) => row.label.startsWith('Serve disadvantage'))).toMatchObject({ forehand: 1, backhand: 0 });
    expect(strokeStats(contexts, 'B', 'return').find((row) => row.label.startsWith('Return advantage')))
      .toMatchObject({ total: 2, forehand: 1, backhand: 0 });
    expect(byLabel(strokeStats(contexts, 'A', 'all'))).toMatchObject({
      Winners: 5, 'Unforced errors': 3, 'Serve-phase winners': 3, 'Serve-phase UE': 3, 'Neutralised winners': 1, 'Neutralised UE': 0,
    });
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

  it('counts drive volleys, legacy topspin, and unspecified shots separately', () => {
    const shots: Point[] = [
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { stroke: 'forehand', shotType: 'drive_volley' })),
      point('A', 'B', 'rally', [serve('in')], rally('server_error', { stroke: 'forehand', shotType: 'drive_volley' })),
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { stroke: 'forehand', shotType: 'topspin' })),
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { stroke: 'forehand', shotType: 'none' })),
    ];
    const contexts = pointContexts(match, shots);
    const winners = rallyWinnerStats(contexts, 'forehand');
    expect(winners.shotType.A.drive_volley).toBe(1);
    expect(winners.shotType.A.topspin).toBe(1);
    expect(winners.shotType.A.none).toBe(1);
    const types = shotTypeStats(contexts);
    expect(types.A.drive_volley).toEqual({ winners: 1, errors: 1 });
    expect(types.A.topspin).toEqual({ winners: 1, errors: 0 });
    expect(types.A.none).toEqual({ winners: 1, errors: 0 });
  });

  it('filters shot types by stroke while the default includes both strokes and unset strokes', () => {
    const contexts = pointContexts(match, [
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { stroke: 'forehand', shotType: 'drive_volley' })),
      point('B', 'A', 'rally', [serve('in')], rally('server_error', { stroke: 'forehand', shotType: 'slice' })),
      point('A', 'B', 'rally', [serve('in')], rally('returner_winner', { stroke: 'backhand', shotType: 'slice' })),
      point('A', 'B', 'rally', [serve('in')], rally('server_error', { stroke: 'backhand', shotType: 'topspin' })),
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { shotType: 'none' })),
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { lucky: true, stroke: 'forehand', shotType: 'drive_volley' })),
    ]);
    const all = shotTypeStats(contexts);
    expect(all).toEqual(shotTypeStats(contexts, 'all'));
    expect(all.A.drive_volley.winners).toBe(1);
    expect(all.A.topspin.errors).toBe(1);
    expect(all.A.none.winners).toBe(1);
    const forehand = shotTypeStats(contexts, 'forehand');
    expect(forehand.A.drive_volley).toEqual({ winners: 1, errors: 0 });
    expect(forehand.B.slice).toEqual({ winners: 0, errors: 1 });
    expect(forehand.A.topspin.errors).toBe(0);
    expect(forehand.A.none.winners).toBe(0);
    const backhand = shotTypeStats(contexts, 'backhand');
    expect(backhand.B.slice).toEqual({ winners: 1, errors: 0 });
    expect(backhand.A.topspin).toEqual({ winners: 0, errors: 1 });
    expect(backhand.A.drive_volley.winners).toBe(0);
    expect(backhand.A.none.winners).toBe(0);
  });

  it('cross-tabulates error directions and types for each player, including missing details', () => {
    const errors = [
      point('A', 'B', 'rally', [serve('in')], rally('server_error', {
        stroke: 'forehand', direction: 'crosscourt', position: 'approach', error: 'net',
      })),
      point('B', 'A', 'rally', [serve('in')], rally('server_error', {
        stroke: 'backhand', direction: 'down_the_line', position: 'net', error: 'long',
      })),
      point('B', 'B', 'return_error', [serve('return_error', {
        return: { stroke: 'backhand', direction: 'inside_out', error: 'wide' },
      })]),
      point('A', 'B', 'double_fault', [serve('fault', { fault: 'long' }), serve('fault', { fault: 'net' })]),
      point('A', 'A', 'return_error', [serve('return_error')]),
      point('A', 'B', 'rally', [serve('in')], rally('server_error', { direction: 'crosscourt' })),
      point('A', 'B', 'rally', [serve('in')], rally('server_error', {
        lucky: true, direction: 'crosscourt', error: 'wide',
      })),
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { direction: 'crosscourt' })),
      point('A', 'A', 'unrecorded', []),
    ];
    const contexts = pointContexts(match, errors);
    const all = errorDirectionStats(contexts, 'all', 'all');
    expect(all.A.crosscourt).toEqual({ net: 1, long: 0, wide: 0, none: 1, total: 2 });
    expect(all.B.down_the_line).toEqual({ net: 0, long: 1, wide: 0, none: 0, total: 1 });
    expect(all.A.inside_out.wide).toBe(1);
    expect(all.A.none).toEqual({ net: 1, long: 0, wide: 0, none: 0, total: 1 });
    expect(all.B.none).toEqual({ net: 0, long: 0, wide: 0, none: 1, total: 1 });
    expect(errorDirectionStats(contexts, 'forehand', 'approach').A.crosscourt.total).toBe(1);
    expect(errorDirectionStats(contexts, 'backhand', 'net').B.down_the_line.long).toBe(1);
    expect(errorDirectionStats(contexts, 'backhand', 'baseline').A.inside_out.wide).toBe(1);
    expect(errorDirectionStats(contexts, 'forehand', 'all').A.none.total).toBe(0);
    expect(errorDirectionStats(contexts, 'all', 'net').A.crosscourt.total).toBe(0);
    expect(Object.values(all.A).reduce((total, counts) => total + counts.total, 0)).toBe(4);
    expect(Object.values(all.B).reduce((total, counts) => total + counts.total, 0)).toBe(2);
  });

  for (const winner of ['A', 'B'] as const) {
    it(`counts a Lucky ball only in total Winners for ${winner}`, () => {
      for (const server of ['A', 'B'] as const) {
        for (const serves of [[serve('in', { location: 't' })], [serve('fault', { location: 'wide' }), serve('in', { location: 'body' })]]) {
          const lucky = point(server, winner, 'rally', serves, rally(server === winner ? 'server_winner' : 'returner_winner', {
            lucky: true, count: 9, stroke: 'forehand', direction: 'down_the_line', shotType: 'drive_volley', position: 'net',
          }));
          const contexts = pointContexts(match, [lucky]);
          const expected = summary([]);
          expected[winner].winners.total = 1;
          expect(summary(contexts)).toEqual(expected);
          for (const player of ['A', 'B'] as const) {
            for (const games of ['all', 'serve', 'return'] as const) {
              expect(strokeStats(contexts, player, games)).toEqual(strokeStats([], player, games));
            }
            for (const sides of [[], ['deuce'], ['ad']] as ServeFilters['sides'][]) {
              const f: ServeFilters = { server: player, sets: [], sides, attempts: [], keyPoints: [], locations: [] };
              expect(servePerformance(contexts, f)).toEqual(servePerformance([], f));
            }
          }
          expect(shotTypeStats(contexts)).toEqual(shotTypeStats([]));
          for (const stroke of ['forehand', 'backhand'] as const) {
            expect(rallyWinnerStats(contexts, stroke)).toEqual(rallyWinnerStats([], stroke));
          }
          expect(errorTypeStats(contexts, 'all', 'all')).toEqual(errorTypeStats([], 'all', 'all'));
        }
      }
    });
  }

  it('keeps scoring context and normal point stats unchanged after a Lucky ball', () => {
    const lucky = point('A', 'A', 'rally', [serve('in', { location: 't' })], rally('server_winner', { lucky: true, count: 3, stroke: 'forehand' }));
    const normal = point('A', 'B', 'return_winner', [serve('return_winner', { location: 'body' })]);
    const contexts = pointContexts(match, [lucky, normal]);
    expect(contexts[1].before.points).toEqual({ a: 1, b: 0 });
    expect(contexts[1].side).toBe('ad');
    const expected = summary(contexts.slice(1));
    expected.A.winners.total++;
    expect(summary(contexts)).toEqual(expected);
    const f: ServeFilters = { server: 'A', sets: [], sides: [], attempts: [], keyPoints: [], locations: [] };
    expect(servePerformance(contexts, { ...f, sides: ['ad'], locations: ['body'] }).all.points).toBe(1);
    expect(servePerformance(contexts, f)).toEqual(servePerformance(contexts.slice(1), f));
    expect(strokeStats(contexts, 'B', 'all')).toEqual(strokeStats(contexts.slice(1), 'B', 'all'));
  });

  it('counts Lucky ball winners only in their selected set', () => {
    const recorded = [
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { lucky: true })),
      ...Array.from({ length: 23 }, () => point('A', 'A', 'unrecorded', [])),
      point('B', 'B', 'rally', [serve('in')], rally('server_winner', { lucky: true })),
    ];
    const contexts = pointContexts(match, recorded);
    expect(contexts.at(-1)?.set).toBe(1);
    expect(summary(filterSets(contexts, [0])).A.winners.total).toBe(1);
    expect(summary(filterSets(contexts, [0])).B.winners.total).toBe(0);
    expect(summary(filterSets(contexts, [1])).A.winners.total).toBe(0);
    expect(summary(filterSets(contexts, [1])).B.winners.total).toBe(1);
    expect(summary(filterSets(contexts, [1])).B.pointsWon).toBe(0);
  });

  it('lists played sets incl. match tiebreak and filters by set', () => {
    const mtb: Match = { ...match, rules: { ...DEFAULT_RULES, finalSet: 'matchTiebreak' } };
    // A wins set 1 6-0, B wins set 2 6-0, then 3 match tiebreak points.
    const winners: Side[] = [...Array(24).fill('A'), ...Array(24).fill('B'), 'A', 'B', 'A'];
    const pts = winners.map((w) => point('A', w, 'unrecorded', []));
    const c = pointContexts(mtb, pts);
    expect(setOptions(c)).toEqual([
      { index: 0, label: 'Set 1' },
      { index: 1, label: 'Set 2' },
      { index: 2, label: 'MTB' },
    ]);
    expect(filterSets(c, [])).toHaveLength(51);
    expect(filterSets(c, [2])).toHaveLength(3);
    expect(filterSets(c, [0, 2])).toHaveLength(27);
  });
});

describe('advanced serve statistics', () => {
  const all: ServeFilters = { server: 'A', sets: [], sides: [], attempts: [], keyPoints: [], locations: [] };
  const ctxs = pointContexts(match, points);

  it('distributes serve attempts, faults included, by location and type', () => {
    // Unrecorded locations count as Body and unrecorded types as Flat.
    const d = serveDistribution(ctxs, all);
    expect([d.t.flat, d.wide.flat, d.body.flat, d.body.slice]).toEqual([2, 2, 3, 0]);
    const first = serveDistribution(ctxs, { ...all, attempts: [1] });
    expect([first.t.flat, first.wide.flat, first.body.flat]).toEqual([2, 2, 1]);
    expect(serveDistribution(ctxs, { ...all, locations: ['t'] }).wide.flat).toBe(2);
    expect(serveDistribution(ctxs, { ...all, server: 'B' }).t.flat).toBe(0);
  });

  it('attributes service points to their last serve for performance and impact', () => {
    expect(servePerformance(ctxs, all).all).toEqual({
      points: 5, serveWinners: 1, servePlusOne: 1, wonDueToServe: 2, ueInAdvantage: 0, doubleFaults: 1, lostDueToServe: 2,
    });
    const second = servePerformance(ctxs, { ...all, attempts: [2] }).all;
    expect([second.points, second.doubleFaults, second.lostDueToServe]).toEqual([2, 1, 1]);
    expect(servePerformance(ctxs, { ...all, locations: ['t'] }).all).toMatchObject({ points: 2, wonDueToServe: 2 });
    expect(servePerformance(ctxs, { ...all, keyPoints: ['first'] }).all.points).toBe(1);
    expect(servePerformance(ctxs, { ...all, sides: ['ad'] }).all.points).toBe(2);
    expect(servePerformance(ctxs, all).flat.points).toBe(5);
    const impact = serveImpactStats(ctxs, all);
    expect(impact.ace).toEqual({ points: 1, won: 1 });
    expect(impact.double_fault).toEqual({ points: 1, won: 0 });
    expect(impact.return_winner).toEqual({ points: 1, won: 0 });
    expect(impact.serve_plus_one).toEqual({ points: 1, won: 1 });
    expect(impact.neutralised).toEqual({ points: 1, won: 1 });
    expect(impact.unknown).toEqual({ points: 0, won: 0 });
  });

  it('counts UE in Serve advantage and server UE in Return advantage', () => {
    const pts = [
      point('A', 'B', 'rally', [serve('in')], rally('server_error', { impact: 'serve_advantage' })),
      point('A', 'B', 'rally', [serve('in')], rally('server_error', { impact: 'serve_disadvantage' })),
      point('A', 'A', 'rally', [serve('in')], rally('server_winner', { impact: 'serve_disadvantage' })),
      point('A', 'A', 'rally', [serve('in')], rally('server_winner')),
    ];
    const c = pointContexts(match, pts);
    expect(servePerformance(c, all).all).toMatchObject({ points: 4, ueInAdvantage: 1, wonDueToServe: 0, lostDueToServe: 1 });
    expect(serveImpactStats(c, all).serve_disadvantage).toEqual({ points: 2, won: 1 });
    expect(serveImpactStats(c, all).unknown).toEqual({ points: 1, won: 1 });
  });

  it('breaks faults down by location and fault type', () => {
    const faults = serveFaults(ctxs, all);
    expect([faults.wide.long, faults.body.net, faults.body.none, faults.t.net]).toEqual([1, 1, 1, 0]);
    expect(serveFaults(ctxs, { ...all, attempts: [2] }).body.net).toBe(1);
    expect(serveFaults(ctxs, { ...all, attempts: [2] }).wide.long).toBe(0);
  });

  it('counts held games, break points saved and location repeats', () => {
    // Game 2: B serves, saves one of two break points and is broken; game 3: A serves two points, unfinished.
    const later = [...points, ...(['A', 'A', 'A', 'B', 'A'] as Side[]).map((w) => point('B', w, 'unrecorded', [])),
      point('A', 'A', 'rally', [serve('in', { location: 'wide' })], rally('server_winner', { impact: 'serve_advantage' })),
      point('A', 'A', 'ace', [serve('ace', { location: 't' })])];
    const c = pointContexts(match, later);
    expect(serviceGamesHeld(match, c, all)).toEqual({ held: 1, played: 1 });
    expect(serviceGamesHeld(match, c, { ...all, server: 'B' })).toEqual({ held: 0, played: 1 });
    expect(serviceGamesHeld(match, pointContexts(match, points.slice(0, 5)), all)).toEqual({ held: 0, played: 0 });
    expect(breakPointsSaved(c, { ...all, server: 'B' })).toEqual({ saved: 1, faced: 2 });
    expect(breakPointsSaved(c, { ...all, server: 'B', sides: ['deuce'] })).toEqual({ saved: 0, faced: 1 });
    // Deuce 1st: T -> Wide -> Body (unrecorded) -> Wide; Ad 1st: Wide -> T -> T.
    expect(locationRepeats(c, all)).toEqual({ repeats: 1, compared: 5 });
    expect(locationRepeats(c, { ...all, sides: ['ad'] })).toEqual({ repeats: 1, compared: 2 });
    expect(locationRepeats(c, { ...all, attempts: [2] })).toEqual({ repeats: 0, compared: 0 });
  });

  it('selects tiebreak points only through the Tiebreak key point', () => {
    const mtb: Match = { ...match, rules: { ...DEFAULT_RULES, bestOf: 1, finalSet: 'matchTiebreak' } };
    const c = pointContexts(mtb, [point('A', 'A', 'ace', [serve('ace')]), point('B', 'B', 'ace', [serve('ace')])]);
    expect(servePerformance(c, { ...all, keyPoints: ['tiebreak'] }).all.points).toBe(1);
    expect(servePerformance(c, { ...all, keyPoints: ['first', 'game', 'break'] }).all.points).toBe(0);
    expect(serviceGamesHeld(mtb, c, all)).toEqual({ held: 0, played: 0 });
  });
});
