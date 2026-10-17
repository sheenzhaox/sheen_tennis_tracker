import { computeScore, other, pointLabels, sideKey, type ScoreState } from '../engine/score';
import type { Match, Rules, Side } from '../model/types';
import { isLuckyBall, pointOutcome, type PerSide, type PointContext } from './matchStats';

/** Minimum swing of the A − B difference that confirms a turning point. */
export const CONTROL_REVERSAL = 10;

export interface ControlPointDelta {
  base: number;
  /** Winner-run or error-run extra. */
  extra: number;
  /** Key-point extra. */
  key: number;
  total: number;
}

export interface ControlGame {
  winner: Side;
  server: Side;
  tiebreak: boolean;
  /** Outcome-layer points for the game, excluding the set bonus. */
  outcome: PerSide<number>;
  setWinner: Side | null;
}

export interface ControlStep {
  ctx: PointContext;
  /** Score before the point within the set, e.g. "3-1 30-40", "6-6 TB 2-1" or "MTB 4-3". */
  score: string;
  /** Grouping unit for single-game checks: the game score, or a 6-point block in a tiebreak. */
  unit: string;
  keyPoint: boolean;
  delta: PerSide<ControlPointDelta>;
  /** Running scores after the point, including game and set bonuses earned on it. */
  total: PerSide<number>;
  game?: ControlGame;
}

export interface ControlSet {
  set: number;
  label: string;
  start: PerSide<number>;
  steps: ControlStep[];
  winner: Side | null;
}

export interface MatchControl {
  sets: ControlSet[];
  recorded: number;
  points: number;
}

const zero = (): PerSide<number> => ({ A: 0, B: 0 });
const SIDES: Side[] = ['A', 'B'];

function winsSet(games: ScoreState['games'], side: Side, rules: Rules) {
  const own = games[sideKey(side)] + 1;
  return own >= rules.gamesPerSet && own - games[sideKey(other(side))] >= 2;
}

function serverCounts(b: ScoreState, server: Side) {
  return { s: b.points[sideKey(server)], r: b.points[sideKey(other(server))] };
}

const isBreakPoint = (b: ScoreState, server: Side) => {
  if (b.inTiebreak) return false;
  const { s, r } = serverCounts(b, server);
  return r >= 3 && r > s;
};

/** 30-all, deuce, break point, game point at 40-30 or Ad-in, set or match point, and every tiebreak point. */
export function isControlKeyPoint(b: ScoreState, server: Side, rules: Rules): boolean {
  if (b.inTiebreak) return true;
  const { s, r } = serverCounts(b, server);
  const bp = isBreakPoint(b, server);
  const gp = s >= 3 && s > r;
  const gameFor = gp ? server : bp ? other(server) : null;
  if (gameFor && winsSet(b.games, gameFor, rules)) return true;
  return (s === 2 && r === 2) || (s >= 3 && s === r) || bp || (gp && r >= 2);
}

function scoreLabel(b: ScoreState, noAd: boolean) {
  const l = pointLabels(b, noAd);
  if (b.isMatchTiebreak) return `MTB ${l.a}-${l.b}`;
  return `${b.games.a}-${b.games.b} ${b.inTiebreak ? 'TB ' : ''}${l.a}-${l.b}`;
}

type Run = { type: 'W' | 'U' | null; n: number };

/** Match Control Score (advanced_statistics/momentum.md, agreed revision 2) with fixed default weights. */
export function matchControl(match: Match, ctxs: PointContext[]): MatchControl {
  const rules = match.rules;
  const keyGame = 2 * rules.gamesPerSet - 3;
  const live = ctxs.filter((c) => !c.before.winner);
  const finalScore = computeScore(rules, match.firstServer ?? 'A', ctxs.map((c) => c.point.winner));
  const sets: ControlSet[] = [];
  let total = zero();
  let run: PerSide<Run> = { A: { type: null, n: 0 }, B: { type: null, n: 0 } };
  let prevGame: { server: Side; broken: boolean } | null = null;
  let lastGames: PerSide<number>[] = [];
  let game: ControlStep[] = [];
  let gameDelta = zero();
  let nextStart = zero();

  const pointDelta = (c: PointContext, X: Side, key: boolean): ControlPointDelta => {
    const p = c.point;
    const outcome = pointOutcome(p);
    const r = run[X];
    const own = outcome.winnerBy === X && !isLuckyBall(p) ? 'W' : outcome.errorBy === X ? 'U' : null;
    let base = 0, extra = 0, bonus = 0;
    if (own === 'W') {
      base = 1;
      if (r.type === 'W') extra = 1;
      run[X] = { type: 'W', n: r.type === 'W' ? r.n + 1 : 1 };
      if (key) bonus = 1;
    } else if (own === 'U') {
      base = p.end === 'double_fault' ? -2 : -1;
      const n = r.type === 'U' ? r.n + 1 : 1;
      extra = n === 2 ? -1 : n > 2 ? -2 : 0;
      run[X] = { type: 'U', n };
      if (key) bonus = -1;
    } else if (p.winner === X ? r.type === 'U' : r.type === 'W') {
      run[X] = { type: null, n: 0 };
    }
    return { base, extra, key: bonus, total: base + extra + bonus };
  };

  live.forEach((c, i) => {
    const b = c.before;
    if (!sets.length || sets[sets.length - 1].set !== c.set) {
      const start = nextStart;
      total = { ...start };
      run = { A: { type: null, n: 0 }, B: { type: null, n: 0 } };
      prevGame = null;
      lastGames = [];
      game = [];
      gameDelta = zero();
      sets.push({ set: c.set, label: c.matchTiebreak ? 'MTB' : `Set ${c.set + 1}`, start, steps: [], winner: null });
    }
    const current = sets[sets.length - 1];
    const keyPoint = isControlKeyPoint(b, c.point.server, rules);
    const delta = { A: pointDelta(c, 'A', keyPoint), B: pointDelta(c, 'B', keyPoint) };
    for (const X of SIDES) {
      total[X] += delta[X].total;
      gameDelta[X] += delta[X].total;
    }
    const step: ControlStep = {
      ctx: c,
      score: scoreLabel(b, rules.noAd),
      unit: b.inTiebreak ? `TB${Math.floor((b.points.a + b.points.b) / 6)}` : `${b.games.a}-${b.games.b}`,
      keyPoint,
      delta,
      total: { ...total },
    };
    current.steps.push(step);
    game.push(step);

    const after = i + 1 < live.length ? live[i + 1].before : finalScore;
    const setEnded = after.sets.length > b.sets.length;
    const gameEnded = setEnded || after.games.a + after.games.b !== b.games.a + b.games.b;
    if (!gameEnded) return;

    const gw = c.point.winner;
    const gl = other(gw);
    const server = game[0].ctx.point.server;
    const out = zero();
    let broken = false;
    if (b.inTiebreak) {
      out[gw] += 3;
      out[gl] -= 3;
    } else {
      const R = other(server);
      const first = game[0].ctx.before;
      const keyStage = first.games.a + first.games.b + 1 >= keyGame;
      broken = gw === R;
      if (broken) {
        out[R] += keyStage ? 3 : 2;
        out[server] -= keyStage ? 3 : 2;
      } else {
        out[server] += keyStage ? 2 : 1;
      }
      const deuces = game.filter((s) => s.ctx.before.points.a >= 3 && s.ctx.before.points.a === s.ctx.before.points.b).length;
      if (!rules.noAd && deuces >= 4) {
        out[gw] += 3;
        out[gl] -= 3;
      }
      if (prevGame && prevGame.server === R && prevGame.broken) {
        if (broken) {
          out[R] += 3;
          out[server] -= 2;
        } else {
          out[server] += 2;
        }
      }
      if (!broken) {
        const saved = game.filter((s) => s.ctx.point.winner === server && isBreakPoint(s.ctx.before, server)).length;
        if (saved > 1) out[server] += saved - 1;
      }
    }
    for (const X of SIDES) {
      total[X] += out[X];
      gameDelta[X] += out[X];
    }
    lastGames.push(gameDelta);
    prevGame = { server, broken };
    step.game = { winner: gw, server, tiebreak: b.inTiebreak, outcome: out, setWinner: setEnded ? gw : null };
    if (setEnded) {
      total[gw] += 3;
      total[gl] -= 3;
      current.winner = gw;
      const form = lastGames.slice(-3).reduce((s, d) => s + d.A - d.B, 0);
      const startA = (gw === 'A' ? 3 : -3) + Math.max(-3, Math.min(3, 0.5 * form));
      nextStart = { A: startA, B: -startA };
    }
    step.total = { ...total };
    game = [];
    gameDelta = zero();
  });

  return {
    sets,
    recorded: live.filter((c) => c.point.end !== 'unrecorded').length,
    points: live.length,
  };
}

export interface TurningPoint {
  /** Index into the set series (0 = set start). */
  index: number;
  type: 'peak' | 'trough';
  value: number;
  /** Change to the next turning point, or to the last point of the set. */
  swing: number;
  to: number;
}

/** Zigzag turning points: an extreme confirmed once the series reverses by at least `reversal`. */
export function turningPoints(values: number[], reversal = CONTROL_REVERSAL): TurningPoint[] {
  const pivots: { index: number; type: 'peak' | 'trough' }[] = [];
  let dir = 0, ext = 0, hi = 0, lo = 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (dir === 0) {
      if (v > values[hi]) hi = i;
      if (v < values[lo]) lo = i;
      if (v - values[lo] >= reversal) {
        if (lo > 0) pivots.push({ index: lo, type: 'trough' });
        dir = 1;
        ext = i;
      } else if (values[hi] - v >= reversal) {
        if (hi > 0) pivots.push({ index: hi, type: 'peak' });
        dir = -1;
        ext = i;
      }
    } else if (dir === 1) {
      if (v >= values[ext]) ext = i;
      else if (values[ext] - v >= reversal) {
        pivots.push({ index: ext, type: 'peak' });
        dir = -1;
        ext = i;
      }
    } else if (v <= values[ext]) ext = i;
    else if (v - values[ext] >= reversal) {
      pivots.push({ index: ext, type: 'trough' });
      dir = 1;
      ext = i;
    }
  }
  return pivots.map((p, k) => {
    const to = k + 1 < pivots.length ? pivots[k + 1].index : values.length - 1;
    return { ...p, value: values[p.index], swing: values[to] - values[p.index], to };
  });
}

export type ControlFactor =
  | { kind: 'winners' | 'errors'; side: Side; count: number; value: number }
  | { kind: 'games'; holds: PerSide<number>; breaks: PerSide<number>; tiebreakWinner: Side | null; value: number }
  | { kind: 'set'; value: number };

export interface ControlSegment {
  number: number;
  /** Index into `ControlSeries.sets`. */
  setIndex: number;
  from: number;
  to: number;
  change: number;
  /** All factors; their values sum to `change`. */
  factors: ControlFactor[];
  /** Largest factor moving in the direction of the change. */
  biggest?: ControlFactor;
}

export interface ControlSeries {
  sets: { set: ControlSet; values: number[]; turns: TurningPoint[] }[];
  segments: ControlSegment[];
}

/** Factors behind the change in X − Y over steps (from, to] of a set series. */
export function segmentFactors(set: ControlSet, from: number, to: number, X: Side): ControlFactor[] {
  const Y = other(X);
  const count = { winners: zero(), errors: zero() };
  const value = { winners: zero(), errors: zero() };
  const holds = zero(), breaks = zero();
  let games = 0, setValue = 0;
  let tiebreakWinner: Side | null = null;
  for (const step of set.steps.slice(from, to)) {
    for (const S of SIDES) {
      const d = step.delta[S];
      if (d.base === 0) continue;
      const kind = d.base > 0 ? 'winners' : 'errors';
      count[kind][S]++;
      value[kind][S] += S === X ? d.total : -d.total;
    }
    const g = step.game;
    if (!g) continue;
    games += g.outcome[X] - g.outcome[Y];
    if (g.tiebreak) tiebreakWinner = g.winner;
    else if (g.winner === g.server) holds[g.winner]++;
    else breaks[g.winner]++;
    if (g.setWinner) setValue += g.setWinner === X ? 6 : -6;
  }
  const factors: ControlFactor[] = [];
  for (const S of [X, Y]) {
    for (const kind of ['winners', 'errors'] as const) {
      factors.push({ kind, side: S, count: count[kind][S], value: value[kind][S] });
    }
  }
  factors.push({ kind: 'games', holds, breaks, tiebreakWinner, value: games }, { kind: 'set', value: setValue });
  return factors.filter((f) => f.value !== 0);
}

/** Per-set X − Y series with turning points and the segments between them that span more than one game. */
export function controlSeries(control: MatchControl, X: Side, reversal = CONTROL_REVERSAL): ControlSeries {
  const sign = X === 'A' ? 1 : -1;
  const segments: ControlSegment[] = [];
  const sets = control.sets.map((set, setIndex) => {
    const values = [set.start, ...set.steps.map((s) => s.total)].map((t) => sign * (t.A - t.B));
    const turns = turningPoints(values, reversal);
    const bounds = [0, ...turns.map((t) => t.index), values.length - 1];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const from = bounds[k], to = bounds[k + 1];
      if (new Set(set.steps.slice(from, to).map((s) => s.unit)).size < 2) continue;
      const change = values[to] - values[from];
      const factors = segmentFactors(set, from, to, X);
      const dir = Math.sign(change) || 1;
      const biggest = factors.filter((f) => Math.sign(f.value) === dir).sort((a, b) => dir * (b.value - a.value))[0];
      segments.push({ number: segments.length + 1, setIndex, from, to, change, factors, biggest });
    }
    return { set, values, turns };
  });
  return { sets, segments };
}
