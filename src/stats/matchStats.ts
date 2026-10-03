import { computeScore, other, sideKey, type ScoreState } from '../engine/score';
import type { Match, Point, Rules, ServeLocation, ShotType, Side } from '../model/types';

export type Situation = 'first' | 'game' | 'break';
export type SideFilter = 'all' | 'deuce' | 'ad';
export type SituationFilter = 'all' | Situation;
export type GameFilter = 'all' | 'serve' | 'return';

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

/** Total shots in the point: ace / DF = 1, return ace / return error = 2, rally = recorded count. */
export function rallyLength(p: Point): number | null {
  switch (p.end) {
    case 'ace':
    case 'double_fault':
      return 1;
    case 'return_winner':
    case 'return_error':
      return 2;
    case 'rally':
      return p.rally?.count ?? null;
    default:
      return null;
  }
}

function endingStroke(p: Point): 'forehand' | 'backhand' | 'none' | 'serve' {
  if (p.end === 'ace' || p.end === 'double_fault') return 'serve';
  if (p.end === 'return_winner' || p.end === 'return_error') return p.serves.at(-1)?.return?.stroke ?? 'none';
  return p.rally?.stroke ?? 'none';
}

export interface StrokeRow {
  label: string;
  total: number;
  /** null when forehand/backhand doesn't apply (serve-only rows). */
  forehand: number | null;
  backhand: number | null;
}

interface Ending {
  point: Point;
  by: Side;
  winner: boolean;
  length: number | null;
}

const between = (n: number | null, lo: number, hi = Infinity) => n !== null && n >= lo && n <= hi;
const oneOf = (n: number | null, ...xs: number[]) => n !== null && xs.includes(n);

/** Winners / unforced errors for one player split by forehand and backhand, for all, service or return games. */
export function strokeStats(ctxs: PointContext[], player: Side, games: GameFilter): StrokeRow[] {
  const opp = other(player);
  const endings: Ending[] = [];
  for (const { point: p } of ctxs) {
    if (games === 'serve' && p.server !== player) continue;
    if (games === 'return' && p.server === player) continue;
    const { winnerBy, errorBy } = pointOutcome(p);
    const by = winnerBy ?? errorBy;
    if (by) endings.push({ point: p, by, winner: !!winnerBy, length: rallyLength(p) });
  }
  const row = (label: string, match: (e: Ending) => boolean, strokes = true): StrokeRow => {
    const hits = endings.filter(match);
    const count = (s: 'forehand' | 'backhand') => hits.filter((e) => endingStroke(e.point) === s).length;
    return { label, total: hits.length, forehand: strokes ? count('forehand') : null, backhand: strokes ? count('backhand') : null };
  };
  const mine = (winner: boolean) => (e: Ending) => e.by === player && e.winner === winner;

  if (games === 'serve') {
    return [
      row('Aces', (e) => e.point.end === 'ace' && e.by === player, false),
      row('Double faults', (e) => e.point.end === 'double_fault' && e.by === player, false),
      row('Serve +1 (winner at shot 3)', (e) => mine(true)(e) && e.length === 3),
      row('Serve advantage (winners at 1/3/5)', (e) => mine(true)(e) && oneOf(e.length, 1, 3, 5)),
      row('Serve disadvantage (opp. winners at 2/4/6)', (e) => e.by === opp && e.winner && oneOf(e.length, 2, 4, 6)),
    ];
  }
  if (games === 'return') {
    return [
      row('Return aces', (e) => e.point.end === 'return_winner' && e.by === player),
      row('Return errors', (e) => e.point.end === 'return_error' && e.by === player),
      row('Return advantage (winners at 2/4/6)', (e) => mine(true)(e) && oneOf(e.length, 2, 4, 6)),
    ];
  }
  return [
    row('Winners', mine(true)),
    row('Unforced errors', mine(false)),
    row('Short rally winners (1-6)', (e) => mine(true)(e) && between(e.length, 1, 6)),
    row('Short rally UE (1-6)', (e) => mine(false)(e) && between(e.length, 1, 6)),
    row('Long rally winners (7+)', (e) => mine(true)(e) && between(e.length, 7)),
    row('Long rally UE (7+)', (e) => mine(false)(e) && between(e.length, 7)),
  ];
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
