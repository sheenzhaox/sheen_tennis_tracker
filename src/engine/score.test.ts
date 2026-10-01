import { describe, expect, it } from 'vitest';
import { computeScore, pointLabels } from './score';
import { DEFAULT_RULES } from '../model/rules';
import type { Rules, Side } from '../model/types';

const game = (w: Side): Side[] => [w, w, w, w];
const games = (...ws: Side[]): Side[] => ws.flatMap(game);
const repeat = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat();
/** Six games each, alternating, to reach 6-6. */
const toSixAll = (): Side[] => repeat(games('A', 'B'), 6);

describe('computeScore', () => {
  it('starts at love with the first server on the deuce side', () => {
    const s = computeScore(DEFAULT_RULES, 'B', []);
    expect(s).toMatchObject({ server: 'B', side: 'deuce', games: { a: 0, b: 0 }, winner: null });
  });

  it('scores a game and rotates the server', () => {
    const s = computeScore(DEFAULT_RULES, 'A', ['A', 'B', 'A']);
    expect(pointLabels(s, false)).toEqual({ a: '30', b: '15' });
    expect(s.side).toBe('ad');
    const g = computeScore(DEFAULT_RULES, 'A', game('A'));
    expect(g.games).toEqual({ a: 1, b: 0 });
    expect(g.server).toBe('B');
  });

  it('handles deuce and advantage', () => {
    const deuce: Side[] = ['A', 'A', 'A', 'B', 'B', 'B'];
    expect(pointLabels(computeScore(DEFAULT_RULES, 'A', deuce), false)).toEqual({ a: '40', b: '40' });
    const adB = computeScore(DEFAULT_RULES, 'A', [...deuce, 'B']);
    expect(pointLabels(adB, false)).toEqual({ a: '40', b: 'AD' });
    expect(computeScore(DEFAULT_RULES, 'A', [...deuce, 'B', 'A']).games).toEqual({ a: 0, b: 0 });
    expect(computeScore(DEFAULT_RULES, 'A', [...deuce, 'B', 'B']).games).toEqual({ a: 0, b: 1 });
  });

  it('no-ad: deciding point at 40-40', () => {
    const rules: Rules = { ...DEFAULT_RULES, noAd: true };
    expect(computeScore(rules, 'A', ['A', 'A', 'A', 'B', 'B', 'B', 'B']).games).toEqual({ a: 0, b: 1 });
  });

  it('wins a set 6-4 and starts the next set', () => {
    const s = computeScore(DEFAULT_RULES, 'A', [...repeat(games('A', 'B'), 4), ...games('A', 'A')]);
    expect(s.sets).toEqual([{ a: 6, b: 4, tiebreak: undefined, matchTiebreak: undefined }]);
    expect(s.setsWon).toEqual({ a: 1, b: 0 });
    expect(s.games).toEqual({ a: 0, b: 0 });
    expect(s.server).toBe('A');
  });

  it('needs two clear games before the tiebreak', () => {
    const s = computeScore(DEFAULT_RULES, 'A', [...repeat(games('A', 'B'), 5), ...games('A')]);
    expect(s.games).toEqual({ a: 6, b: 5 });
    expect(s.sets).toHaveLength(0);
  });

  it('plays a tiebreak at 6-6 with correct server rotation', () => {
    const base = toSixAll();
    const start = computeScore(DEFAULT_RULES, 'A', base);
    expect(start.inTiebreak).toBe(true);
    expect(start.server).toBe('A');
    const servers = [0, 1, 2, 3, 4, 5].map((n) => computeScore(DEFAULT_RULES, 'A', [...base, ...repeat(['A', 'B'] as Side[], 3).slice(0, n)]).server);
    expect(servers).toEqual(['A', 'B', 'B', 'A', 'A', 'B']);

    const done = computeScore(DEFAULT_RULES, 'A', [...base, ...repeat(['A'] as Side[], 7)]);
    expect(done.sets[0]).toMatchObject({ a: 7, b: 6, tiebreak: { a: 7, b: 0 } });
    // The player who served first in the tiebreak receives first in the next set.
    expect(done.server).toBe('B');
  });

  it('tiebreak needs a two-point margin', () => {
    const base = toSixAll();
    const s = computeScore(DEFAULT_RULES, 'A', [...base, ...repeat(['A', 'B'] as Side[], 6), 'A']);
    expect(s.inTiebreak).toBe(true);
    expect(pointLabels(s, false)).toEqual({ a: '7', b: '6' });
  });

  it('wins a best-of-3 match in straight sets', () => {
    const set = repeat(games('A'), 6);
    const s = computeScore(DEFAULT_RULES, 'B', [...set, ...set]);
    expect(s.winner).toBe('A');
    expect(s.setsWon).toEqual({ a: 2, b: 0 });
    expect(computeScore(DEFAULT_RULES, 'B', [...set, ...set, 'B']).points).toEqual({ a: 0, b: 0 });
  });

  it('plays a match tiebreak instead of the deciding set', () => {
    const rules: Rules = { ...DEFAULT_RULES, finalSet: 'matchTiebreak' };
    const setA = repeat(games('A'), 6);
    const setB = repeat(games('B'), 6);
    const start = computeScore(rules, 'A', [...setA, ...setB]);
    expect(start.isMatchTiebreak).toBe(true);
    const done = computeScore(rules, 'A', [...setA, ...setB, ...repeat(['B'] as Side[], 10)]);
    expect(done.winner).toBe('B');
    expect(done.sets[2]).toMatchObject({ matchTiebreak: true, tiebreak: { a: 0, b: 10 } });
  });

  it('deciding set without tiebreak goes past 6-6', () => {
    const rules: Rules = { ...DEFAULT_RULES, bestOf: 1, finalSet: 'noTiebreak' };
    const s = computeScore(rules, 'A', toSixAll());
    expect(s.inTiebreak).toBe(false);
    expect(computeScore(rules, 'A', [...toSixAll(), ...games('A', 'A')]).winner).toBe('A');
  });

  it('short sets: tiebreak at 3-3 when configured', () => {
    const rules: Rules = { ...DEFAULT_RULES, gamesPerSet: 4, tiebreakAt: 3 };
    const s = computeScore(rules, 'A', repeat(games('A', 'B'), 3));
    expect(s.inTiebreak).toBe(true);
  });
});
