import { computeScore, other, sideKey, type ScoreState } from '../engine/score';
import type { Match, Point, Rules, ServeLocation, ShotType, Side } from '../model/types';

export type Situation = 'first' | 'game' | 'break';
export type SideFilter = 'all' | 'deuce' | 'ad';
export type SituationFilter = 'all' | Situation;
/** 'odd' = 1/3/5 shots (ended on the server's shot), 'even' = 2/4/6 shots (ended on the returner's shot). */
export type RallyLengthFilter = 'all' | 'odd' | 'even' | 'long';

export interface PointContext {
  point: Point;
  receiver: Side;
  /** Score before the point. */
  before: ScoreState;
  side: 'deuce' | 'ad';
  situations: Set<Situation>;
}

export type PerSide<T> = Record<Side, T>;

function situationsOf(before: ScoreState, server: Side, rules: Rules): Set<Situation> {
  const out = new Set<Situation>();
  if (before.inTiebreak || before.winner) return out;
  const sp = before.points[sideKey(server)];
  const rp = before.points[sideKey(other(server))];
  if (sp + rp === 0) out.add('first');
  if (rules.noAd ? sp === 3 : sp >= 3 && sp > rp) out.add('game');
  if (rules.noAd ? rp === 3 : rp >= 3 && rp > sp) out.add('break');
  return out;
}

export function pointContexts(match: Match, points: Point[]): PointContext[] {
  const firstServer = match.firstServer ?? 'A';
  const winners = points.map((p) => p.winner);
  return points.map((point, i) => {
    const before = computeScore(match.rules, firstServer, winners.slice(0, i));
    return {
      point,
      receiver: other(point.server),
      before,
      side: before.side,
      situations: situationsOf(before, point.server, match.rules),
    };
  });
}

/** Who hit the winner / made the unforced error that ended the point, if recorded. */
export function pointOutcome(p: Point): { winnerBy?: Side; errorBy?: Side } {
  const receiver = other(p.server);
  switch (p.end) {
    case 'ace':
      return { winnerBy: p.server };
    case 'return_winner':
      return { winnerBy: receiver };
    case 'double_fault':
      return { errorBy: p.server };
    case 'return_error':
      return { errorBy: receiver };
    case 'rally': {
      if (!p.rally) return {};
      const by = p.rally.ending.startsWith('server') ? p.server : receiver;
      return p.rally.ending.endsWith('winner') ? { winnerBy: by } : { errorBy: by };
    }
    default:
      return {};
  }
}

export interface Summary {
  pointsWon: number;
  winners: { total: number; aces: number; returnWinners: number; rallyWinners: number };
  errors: { total: number; doubleFaults: number; returnErrors: number; rallyErrors: number };
  firstServe: { served: number; in: number; won: number };
  secondServe: { served: number; won: number };
}

const emptySummary = (): Summary => ({
  pointsWon: 0,
  winners: { total: 0, aces: 0, returnWinners: 0, rallyWinners: 0 },
  errors: { total: 0, doubleFaults: 0, returnErrors: 0, rallyErrors: 0 },
  firstServe: { served: 0, in: 0, won: 0 },
  secondServe: { served: 0, won: 0 },
});

export function summary(ctxs: PointContext[]): PerSide<Summary> {
  const s: PerSide<Summary> = { A: emptySummary(), B: emptySummary() };
  for (const { point: p } of ctxs) {
    s[p.winner].pointsWon++;
    const { winnerBy, errorBy } = pointOutcome(p);
    if (winnerBy) {
      const w = s[winnerBy].winners;
      w.total++;
      if (p.end === 'ace') w.aces++;
      else if (p.end === 'return_winner') w.returnWinners++;
      else w.rallyWinners++;
    }
    if (errorBy) {
      const e = s[errorBy].errors;
      e.total++;
      if (p.end === 'double_fault') e.doubleFaults++;
      else if (p.end === 'return_error') e.returnErrors++;
      else e.rallyErrors++;
    }
    if (p.serves.length === 0) continue;
    const srv = s[p.server];
    srv.firstServe.served++;
    if (p.serves[0].result !== 'fault') {
      srv.firstServe.in++;
      if (p.winner === p.server) srv.firstServe.won++;
    } else if (p.serves.length > 1) {
      srv.secondServe.served++;
      if (p.winner === p.server) srv.secondServe.won++;
    }
  }
  return s;
}

export interface ServeCell {
  count: number;
  in: number;
  won: number;
}

export type ServeLocationStats = Record<ServeLocation, { first: ServeCell; second: ServeCell }>;

const LOCATIONS: ServeLocation[] = ['wide', 'body', 't', 'none'];

export function serveLocationStats(
  ctxs: PointContext[],
  server: Side,
  side: SideFilter,
  situation: SituationFilter,
): ServeLocationStats {
  const cell = (): ServeCell => ({ count: 0, in: 0, won: 0 });
  const out = Object.fromEntries(LOCATIONS.map((l) => [l, { first: cell(), second: cell() }])) as ServeLocationStats;
  for (const c of ctxs) {
    const p = c.point;
    if (p.server !== server || p.serves.length === 0) continue;
    if (side !== 'all' && c.side !== side) continue;
    if (situation !== 'all' && !c.situations.has(situation)) continue;
    p.serves.forEach((s, i) => {
      const target = out[s.location][i === 0 ? 'first' : 'second'];
      target.count++;
      if (s.result !== 'fault') {
        target.in++;
        if (p.winner === server) target.won++;
      }
    });
  }
  return out;
}

export interface WinnerErrorCount {
  winners: number;
  errors: number;
}

export type StrokeStats = PerSide<Record<'forehand' | 'backhand' | 'none', WinnerErrorCount>>;

function inRallyLength(count: number | null, f: RallyLengthFilter): boolean {
  if (f === 'all') return true;
  if (count === null || count < 1) return false;
  if (f === 'long') return count >= 7;
  return count <= 6 && count % 2 === (f === 'odd' ? 1 : 0);
}

/** Forehand / backhand winners and unforced errors that ended a rally. */
export function rallyStrokeStats(ctxs: PointContext[], length: RallyLengthFilter): StrokeStats {
  const row = () => ({ forehand: { winners: 0, errors: 0 }, backhand: { winners: 0, errors: 0 }, none: { winners: 0, errors: 0 } });
  const out: StrokeStats = { A: row(), B: row() };
  for (const { point: p } of ctxs) {
    if (p.end !== 'rally' || !p.rally || !inRallyLength(p.rally.count, length)) continue;
    const { winnerBy, errorBy } = pointOutcome(p);
    const by = (winnerBy ?? errorBy)!;
    out[by][p.rally.stroke][winnerBy ? 'winners' : 'errors']++;
  }
  return out;
}

export type ShotTypeStats = PerSide<Record<ShotType, WinnerErrorCount>>;

const SHOT_TYPES: ShotType[] = ['topspin', 'slice', 'volley', 'smash', 'lob', 'dropshot', 'none'];

/** Shot type of the last shot of each rally, split into winners and unforced errors. */
export function shotTypeStats(ctxs: PointContext[]): ShotTypeStats {
  const row = () => Object.fromEntries(SHOT_TYPES.map((t) => [t, { winners: 0, errors: 0 }])) as Record<ShotType, WinnerErrorCount>;
  const out: ShotTypeStats = { A: row(), B: row() };
  for (const { point: p } of ctxs) {
    if (p.end !== 'rally' || !p.rally) continue;
    const { winnerBy, errorBy } = pointOutcome(p);
    out[(winnerBy ?? errorBy)!][p.rally.shotType][winnerBy ? 'winners' : 'errors']++;
  }
  return out;
}

export interface ErrorBreakdown {
  stroke: Record<'forehand' | 'backhand' | 'serve' | 'none', number>;
  position: Record<'baseline' | 'approach' | 'net' | 'none', number>;
  type: Record<'net' | 'long' | 'wide' | 'none', number>;
}

/** Unforced errors (double faults, return errors, rally errors) by stroke, court position and error type. */
export function errorBreakdown(ctxs: PointContext[]): PerSide<ErrorBreakdown> {
  const empty = (): ErrorBreakdown => ({
    stroke: { forehand: 0, backhand: 0, serve: 0, none: 0 },
    position: { baseline: 0, approach: 0, net: 0, none: 0 },
    type: { net: 0, long: 0, wide: 0, none: 0 },
  });
  const out: PerSide<ErrorBreakdown> = { A: empty(), B: empty() };
  for (const { point: p } of ctxs) {
    const { errorBy } = pointOutcome(p);
    if (!errorBy) continue;
    const e = out[errorBy];
    if (p.end === 'double_fault') {
      e.stroke.serve++;
      e.position.none++;
      e.type[p.serves.at(-1)?.fault ?? 'none']++;
    } else if (p.end === 'return_error') {
      const r = p.serves.at(-1)?.return;
      e.stroke[r?.stroke ?? 'none']++;
      e.position.none++;
      e.type[r?.error ?? 'none']++;
    } else if (p.rally) {
      e.stroke[p.rally.stroke]++;
      e.position[p.rally.position]++;
      e.type[p.rally.error ?? 'none']++;
    }
  }
  return out;
}
