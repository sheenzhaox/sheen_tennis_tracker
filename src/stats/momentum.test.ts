import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../model/rules';
import type { Match, Point, RallyEnding, Rules, Side } from '../model/types';
import type { ScoreState } from '../engine/score';
import { pointContexts } from './matchStats';
import { controlSeries, isControlKeyPoint, matchControl, segmentFactors, turningPoints } from './momentum';

const game = (rules: Rules): Match => ({
  id: 'm', playerAId: 'a', playerBId: 'b', ruleSetId: 'r', ruleSetName: 'r', rules, firstServer: 'A', status: 'completed', updatedAt: 0,
});
const point = (seq: number, server: Side, winner: Side, end: Point['end'], ending?: RallyEnding, lucky = false): Point => ({
  id: String(seq), matchId: 'm', seq, server, winner, end, serves: [],
  rally: ending ? { ending, stroke: 'none', direction: 'none', shotType: 'none', position: 'none', lucky } : undefined,
  createdAt: 0, updatedAt: 0,
});
const unrecorded = (server: Side, winners: Side[], from = 0) => winners.map((w, i) => point(from + i, server, w, 'unrecorded'));
const control = (rules: Rules, points: Point[]) => {
  const match = game(rules);
  return matchControl(match, pointContexts(match, points));
};
const state = (games: [number, number], points: [number, number]): ScoreState => ({
  sets: [], games: { a: games[0], b: games[1] }, points: { a: points[0], b: points[1] }, setsWon: { a: 0, b: 0 },
  inTiebreak: false, isMatchTiebreak: false, server: 'A', side: 'deuce', winner: null,
});

describe('Match Control Score', () => {
  it('scores a held first game point by point', () => {
    const points = [
      point(0, 'A', 'A', 'ace'),
      point(1, 'A', 'A', 'ace'),
      point(2, 'A', 'B', 'return_winner'),
      point(3, 'A', 'B', 'double_fault'),
      point(4, 'A', 'B', 'rally', 'server_error'),
      point(5, 'A', 'A', 'rally', 'returner_error'),
      point(6, 'A', 'A', 'ace'),
      point(7, 'A', 'A', 'rally', 'server_winner'),
    ];
    const set = control(DEFAULT_RULES, points).sets[0];
    expect(set.steps.map((s) => s.delta.A.total)).toEqual([1, 2, 0, -2, -3, 0, 2, 3]);
    expect(set.steps.map((s) => s.delta.B.total)).toEqual([0, 0, 1, 0, 0, -2, 0, 0]);
    expect(set.steps.map((s) => s.keyPoint)).toEqual([false, false, false, false, true, true, true, true]);
    expect(set.steps[7].game).toMatchObject({ winner: 'A', server: 'A', outcome: { A: 1, B: 0 }, setWinner: null });
    expect(set.steps[7].total).toEqual({ A: 4, B: -1 });
    expect(set.steps[4].score).toBe('0-0 30-30');
  });

  it('keeps runs through lucky and opponent points by point winner', () => {
    const winners = control(DEFAULT_RULES, [
      point(0, 'A', 'A', 'rally', 'server_winner'),
      point(1, 'A', 'A', 'rally', 'server_winner', true),
      point(2, 'A', 'A', 'rally', 'server_winner'),
    ]).sets[0].steps;
    expect(winners.map((s) => s.delta.A.total)).toEqual([1, 0, 2]);
    const errors = control(DEFAULT_RULES, [
      point(0, 'A', 'B', 'rally', 'server_error'),
      point(1, 'A', 'A', 'rally', 'returner_error'),
      point(2, 'A', 'B', 'rally', 'server_error'),
    ]).sets[0].steps;
    expect(errors.map((s) => s.delta.A.total)).toEqual([-1, 0, -1]);
  });

  it('recognises key points, excluding easy game points unless they win the set', () => {
    expect(isControlKeyPoint(state([0, 0], [3, 1]), 'A', DEFAULT_RULES)).toBe(false);
    expect(isControlKeyPoint(state([0, 0], [3, 0]), 'A', DEFAULT_RULES)).toBe(false);
    expect(isControlKeyPoint(state([0, 0], [3, 2]), 'A', DEFAULT_RULES)).toBe(true);
    expect(isControlKeyPoint(state([0, 0], [1, 3]), 'A', DEFAULT_RULES)).toBe(true);
    expect(isControlKeyPoint(state([0, 0], [5, 5]), 'A', DEFAULT_RULES)).toBe(true);
    expect(isControlKeyPoint(state([5, 4], [3, 0]), 'A', DEFAULT_RULES)).toBe(true);
    expect(isControlKeyPoint(state([5, 5], [3, 0]), 'A', DEFAULT_RULES)).toBe(false);
  });

  it('adds break, consolidation and set bonuses, then starts the next set from S4', () => {
    const rules: Rules = { ...DEFAULT_RULES, gamesPerSet: 2, tiebreakAt: null };
    const points = [
      ...unrecorded('A', ['B', 'B', 'B', 'B']),
      ...unrecorded('B', ['B', 'B', 'B', 'B'], 4),
      ...unrecorded('A', ['A', 'A', 'A', 'A'], 8),
      ...unrecorded('B', ['B'], 12),
    ];
    const result = control(rules, points);
    expect(result.recorded).toBe(0);
    expect(result.points).toBe(13);
    const [first, second] = result.sets;
    expect(first.winner).toBe('B');
    expect(first.steps[3].game?.outcome).toEqual({ A: -3, B: 3 });
    expect(first.steps[7].game?.outcome).toEqual({ A: 0, B: 4 });
    expect(first.steps[7].total).toEqual({ A: -6, B: 10 });
    expect(second.start).toEqual({ A: -6, B: 6 });
    expect(second.steps[3].total).toEqual({ A: -4, B: 6 });
    // Unfinished final game earns no outcome points.
    expect(second.steps[4].game).toBeUndefined();
    expect(second.winner).toBeNull();

    const series = controlSeries(result, 'A');
    expect(series.sets[0].values.at(-1)).toBe(-16);
    expect(series.sets[1].values[0]).toBe(-12);
    expect(series.segments).toHaveLength(2);
    expect(series.segments[0]).toMatchObject({ setIndex: 0, from: 0, to: 8, change: -16 });
    expect(series.segments[0].biggest).toMatchObject({ kind: 'games', value: -10, breaks: { A: 0, B: 1 }, holds: { A: 0, B: 1 } });
    const factors = segmentFactors(first, 0, 8, 'A');
    expect(factors.reduce((sum, f) => sum + f.value, 0)).toBe(-16);
    expect(controlSeries(result, 'B').sets[0].values.at(-1)).toBe(16);
  });

  it('finds zigzag turning points after a reversal of 10', () => {
    expect(turningPoints([0, 5, 12, 2, 8, -3])).toEqual([{ index: 2, type: 'peak', value: 12, swing: -15, to: 5 }]);
    expect(turningPoints([0, 4, -4, 3])).toEqual([]);
  });
});
