import { computeScore, other, sideKey, type ScoreState } from '../engine/score';
import type { Match, Point, ReturnError, Rules, Serve, ServeImpact, ServeLocation, ServeType, ShotDirection, ShotType, Side } from '../model/types';
import { RECORDED_SHOT_TYPES, rallyWonByServer } from '../model/types';

export type Situation = 'first' | 'game' | 'break';
export type GameFilter = 'all' | 'serve' | 'return';

export interface PointContext {
  point: Point;
  receiver: Side;
  /** Score before the point. */
  before: ScoreState;
  side: 'deuce' | 'ad';
  situations: Set<Situation>;
  /** 0-based index of the set the point was played in. */
  set: number;
  matchTiebreak: boolean;
}

export type PerSide<T> = Record<Side, T>;

export const isLuckyBall = (point: Point) => point.end === 'rally' && point.rally?.lucky === true;

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
      set: before.sets.length,
      matchTiebreak: before.isMatchTiebreak,
    };
  });
}

export interface SetOption {
  index: number;
  label: string;
}

/** Sets with at least one point, labelled "Set N" or "MTB" for a match tiebreak. */
export function setOptions(ctxs: PointContext[]): SetOption[] {
  const out: SetOption[] = [];
  for (const c of ctxs) {
    if (out.some((o) => o.index === c.set)) continue;
    out.push({ index: c.set, label: c.matchTiebreak ? 'MTB' : `Set ${c.set + 1}` });
  }
  return out;
}

/** Points in the selected sets; an empty selection keeps all points. */
export function filterSets(ctxs: PointContext[], sets: number[]): PointContext[] {
  return sets.length === 0 ? ctxs : ctxs.filter((c) => sets.includes(c.set));
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
    if (isLuckyBall(p)) {
      s[p.winner].winners.total++;
      continue;
    }
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

export interface WinnerErrorCount {
  winners: number;
  errors: number;
}

export type KnownServeImpact = Exclude<ServeImpact, 'none'>;

/**
 * Serve Impact State of a rally point: the recorded state, else mapped from a legacy total shot count
 * (3 + server winner = Serve + 1, 3-6 = by ending-shot player, 7+ = Neutralised). Null when unknown.
 */
export function serveImpact(p: Point): KnownServeImpact | null {
  if (p.end !== 'rally' || !p.rally) return null;
  const { impact, count, ending } = p.rally;
  if (impact && impact !== 'none') return impact;
  if (count == null || count < 3) return null;
  if (count >= 7) return 'neutralised';
  if (count === 3 && ending === 'server_winner') return 'serve_plus_one';
  return ending.startsWith('server') ? 'serve_advantage' : 'serve_disadvantage';
}

/** Serve advantage: ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage point. */
export function wonDueToServe(p: Point): boolean {
  if (p.end === 'ace' || p.end === 'return_error') return true;
  const impact = serveImpact(p);
  return impact === 'serve_plus_one' || (impact === 'serve_advantage' && rallyWonByServer(p.rally!.ending));
}

/** Serve disadvantage: double fault, return ace, or receiver winner / server UE in a Return advantage point. */
export function lostDueToServe(p: Point): boolean {
  if (p.end === 'double_fault' || p.end === 'return_winner') return true;
  return serveImpact(p) === 'serve_disadvantage' && !rallyWonByServer(p.rally!.ending);
}

/** Direct serve/return endings are serve-phase; rallies follow their Serve Impact State. */
export function pointPhase(p: Point): 'serve' | 'neutralised' | null {
  if (p.end === 'ace' || p.end === 'double_fault' || p.end === 'return_winner' || p.end === 'return_error') return 'serve';
  const impact = serveImpact(p);
  if (!impact) return null;
  return impact === 'neutralised' ? 'neutralised' : 'serve';
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
  impact: KnownServeImpact | null;
  phase: 'serve' | 'neutralised' | null;
}

/** Winners / unforced errors for one player split by forehand and backhand, for all, service or return games. */
export function strokeStats(ctxs: PointContext[], player: Side, games: GameFilter): StrokeRow[] {
  const opp = other(player);
  const endings: Ending[] = [];
  for (const { point: p } of ctxs) {
    if (isLuckyBall(p)) continue;
    if (games === 'serve' && p.server !== player) continue;
    if (games === 'return' && p.server === player) continue;
    const { winnerBy, errorBy } = pointOutcome(p);
    const by = winnerBy ?? errorBy;
    if (by) endings.push({ point: p, by, winner: !!winnerBy, impact: serveImpact(p), phase: pointPhase(p) });
  }
  const row = (label: string, match: (e: Ending) => boolean, strokes: boolean | ((e: Ending) => boolean) = true): StrokeRow => {
    const hits = endings.filter(match);
    const strokeHits = typeof strokes === 'function' ? hits.filter(strokes) : hits;
    const count = (s: 'forehand' | 'backhand') => strokeHits.filter((e) => endingStroke(e.point) === s).length;
    return { label, total: hits.length, forehand: strokes ? count('forehand') : null, backhand: strokes ? count('backhand') : null };
  };
  const mine = (winner: boolean) => (e: Ending) => e.by === player && e.winner === winner;
  const serveDisadvantage = (e: Ending) => lostDueToServe(e.point);
  const serveAdvantage = (e: Ending) => wonDueToServe(e.point);

  if (games === 'serve') {
    return [
      row('Aces', (e) => e.point.end === 'ace' && e.by === player, false),
      row('Double faults', (e) => e.point.end === 'double_fault' && e.by === player, false),
      row('Serve +1 winners', (e) => mine(true)(e) && e.impact === 'serve_plus_one'),
      // Opponent errors carry the opponent's stroke, so only the server's own shots fill Forehand/Backhand.
      row('Serve advantage (ace / return error / Serve +1 / won in Serve advantage)', serveAdvantage, (e) => e.by === player),
      row('Serve disadvantage (double fault / return ace / lost in Return advantage)', serveDisadvantage, (e) => e.by === opp),
    ];
  }
  if (games === 'return') {
    return [
      row('Return aces', (e) => e.point.end === 'return_winner' && e.by === player),
      row('Return errors', (e) => e.point.end === 'return_error' && e.by === player),
      row('Return advantage (return ace / won in Return advantage)', (e) => e.point.end !== 'double_fault' && serveDisadvantage(e), (e) => e.by === player),
    ];
  }
  return [
    row('Winners', mine(true)),
    row('Unforced errors', mine(false)),
    row('Serve-phase winners (direct / Serve +1 / advantage / disadvantage)', (e) => mine(true)(e) && e.phase === 'serve'),
    row('Serve-phase UE (direct / Serve +1 / advantage / disadvantage)', (e) => mine(false)(e) && e.phase === 'serve'),
    row('Neutralised winners', (e) => mine(true)(e) && e.phase === 'neutralised'),
    row('Neutralised UE', (e) => mine(false)(e) && e.phase === 'neutralised'),
  ];
}

export type KeyPoint = Situation | 'tiebreak';
export type ServeSpot = Exclude<ServeLocation, 'none'>;
export type ServeKind = Exclude<ServeType, 'none'>;

/** Advanced Analysis serve filters; an empty list means no restriction. */
export interface ServeFilters {
  server: Side;
  sets: number[];
  sides: ('deuce' | 'ad')[];
  attempts: number[];
  keyPoints: KeyPoint[];
  locations: ServeSpot[];
}

const SPOTS: ServeSpot[] = ['wide', 'body', 't'];
const KINDS: ServeKind[] = ['flat', 'slice', 'kick'];
// Advanced serve statistics treat an unrecorded location as Body and an unrecorded type as Flat.
export const spotOf = (s: Serve): ServeSpot => (s.location === 'none' ? 'body' : s.location);
export const kindOf = (s: Serve): ServeKind => (s.type === 'none' ? 'flat' : s.type);
const chosen = <T>(list: T[], value: T) => list.length === 0 || list.includes(value);
const isKeyPoint = (c: PointContext, keys: KeyPoint[]) =>
  keys.length === 0 || keys.some((k) => (k === 'tiebreak' ? c.before.inTiebreak : c.situations.has(k)));

/** The server's recorded points (no Lucky balls / manual points) in the selected sets, sides and key points. */
function recordedServes(ctxs: PointContext[], f: ServeFilters): PointContext[] {
  return filterSets(ctxs, f.sets).filter((c) => c.point.server === f.server && c.point.serves.length > 0
    && c.point.end !== 'unrecorded' && !isLuckyBall(c.point) && chosen(f.sides, c.side) && isKeyPoint(c, f.keyPoints));
}

/** Service points attributed to their last serve attempt, filtered by that attempt's number and location. */
function servicePoints(ctxs: PointContext[], f: ServeFilters): Point[] {
  return recordedServes(ctxs, f).map((c) => c.point)
    .filter((p) => chosen(f.attempts, p.serves.length) && chosen(f.locations, spotOf(p.serves.at(-1)!)));
}

export type LocationTypeCounts = Record<ServeSpot, Record<ServeKind, number>>;

/** Serve attempts (faults included) by location and serve type. The location filter does not apply. */
export function serveDistribution(ctxs: PointContext[], f: ServeFilters): LocationTypeCounts {
  const out = Object.fromEntries(SPOTS.map((l) => [l, Object.fromEntries(KINDS.map((t) => [t, 0]))])) as LocationTypeCounts;
  for (const { point: p } of recordedServes(ctxs, f)) {
    p.serves.forEach((s, i) => {
      if (chosen(f.attempts, i + 1)) out[spotOf(s)][kindOf(s)]++;
    });
  }
  return out;
}

export interface ServePerformance {
  points: number;
  serveWinners: number;
  servePlusOne: number;
  wonDueToServe: number;
  ueInAdvantage: number;
  doubleFaults: number;
  lostDueToServe: number;
}

/** Serve performance in total and by the serve type of the attributed (last) attempt. */
export function servePerformance(ctxs: PointContext[], f: ServeFilters): Record<ServeKind | 'all', ServePerformance> {
  const empty = (): ServePerformance => ({
    points: 0, serveWinners: 0, servePlusOne: 0, wonDueToServe: 0, ueInAdvantage: 0, doubleFaults: 0, lostDueToServe: 0,
  });
  const out = Object.fromEntries((['all', ...KINDS] as const).map((t) => [t, empty()])) as Record<ServeKind | 'all', ServePerformance>;
  for (const p of servicePoints(ctxs, f)) {
    const impact = serveImpact(p);
    for (const row of [out.all, out[kindOf(p.serves.at(-1)!)]]) {
      row.points++;
      if (p.end === 'ace' || p.end === 'return_error') row.serveWinners++;
      if (impact === 'serve_plus_one') row.servePlusOne++;
      if (wonDueToServe(p)) row.wonDueToServe++;
      if (impact === 'serve_advantage' && p.rally!.ending === 'server_error') row.ueInAdvantage++;
      if (p.end === 'double_fault') row.doubleFaults++;
      if (lostDueToServe(p)) row.lostDueToServe++;
    }
  }
  return out;
}

export type ImpactRow = 'ace' | 'return_error' | 'double_fault' | 'return_winner' | KnownServeImpact | 'unknown';

/** Service points split into mutually exclusive endings / Serve Impact States, with points won by the server. */
export function serveImpactStats(ctxs: PointContext[], f: ServeFilters): Record<ImpactRow, { points: number; won: number }> {
  const rows: ImpactRow[] = ['ace', 'return_error', 'double_fault', 'return_winner',
    'serve_plus_one', 'serve_advantage', 'serve_disadvantage', 'neutralised', 'unknown'];
  const out = Object.fromEntries(rows.map((r) => [r, { points: 0, won: 0 }])) as Record<ImpactRow, { points: number; won: number }>;
  for (const p of servicePoints(ctxs, f)) {
    const row: ImpactRow = p.end === 'rally' ? serveImpact(p) ?? 'unknown' : p.end as ImpactRow;
    out[row].points++;
    if (p.winner === p.server) out[row].won++;
  }
  return out;
}

/** Serve faults by location and fault type. The location filter does not apply. */
export function serveFaults(ctxs: PointContext[], f: ServeFilters): Record<ServeSpot, Record<ReturnError, number>> {
  const out = Object.fromEntries(SPOTS.map((l) => [l, { net: 0, long: 0, wide: 0, none: 0 }])) as Record<ServeSpot, Record<ReturnError, number>>;
  for (const { point: p } of recordedServes(ctxs, f)) {
    p.serves.forEach((s, i) => {
      if (s.result === 'fault' && chosen(f.attempts, i + 1)) out[spotOf(s)][s.fault ?? 'none']++;
    });
  }
  return out;
}

/** Break points faced and won by the server (Set, Player and Court side filters only). */
export function breakPointsSaved(ctxs: PointContext[], f: ServeFilters): { saved: number; faced: number } {
  const faced = filterSets(ctxs, f.sets)
    .filter((c) => c.point.server === f.server && chosen(f.sides, c.side) && c.situations.has('break'));
  return { saved: faced.filter((c) => c.point.winner === f.server).length, faced: faced.length };
}

/** Completed regular service games won by the server (Set and Player filters only); tiebreaks are not service games. */
export function serviceGamesHeld(match: Match, ctxs: PointContext[], f: ServeFilters): { held: number; played: number } {
  const after = computeScore(match.rules, match.firstServer ?? 'A', ctxs.map((c) => c.point.winner));
  // The last recorded game counts only if it was played out (e.g. not interrupted by a retirement).
  const lastGameOver = after.points.a + after.points.b === 0;
  const gameKey = (c: PointContext) => `${c.set}:${c.before.games.a + c.before.games.b}:${c.before.inTiebreak}`;
  let held = 0;
  let played = 0;
  ctxs.forEach((c, i) => {
    const next = ctxs[i + 1];
    const gameOver = next ? gameKey(next) !== gameKey(c) : lastGameOver;
    if (!gameOver || c.before.inTiebreak || c.point.server !== f.server || !chosen(f.sets, c.set)) return;
    played++;
    if (c.point.winner === f.server) held++;
  });
  return { held, played };
}

/**
 * Serves whose location repeats the server's previous serve on the same court side and attempt number.
 * The chain runs through the selected sets in match order; an unrecorded location counts as Body.
 */
export function locationRepeats(ctxs: PointContext[], f: ServeFilters): { repeats: number; compared: number } {
  const last = new Map<string, ServeSpot>();
  let repeats = 0;
  let compared = 0;
  for (const { point: p, side } of filterSets(ctxs, f.sets)) {
    if (p.server !== f.server || p.end === 'unrecorded' || isLuckyBall(p) || !chosen(f.sides, side)) continue;
    p.serves.forEach((s, i) => {
      if (!chosen(f.attempts, i + 1)) return;
      const key = `${side}:${i + 1}`;
      const previous = last.get(key);
      const spot = spotOf(s);
      if (previous) {
        compared++;
        if (previous === spot) repeats++;
      }
      last.set(key, spot);
    });
  }
  return { repeats, compared };
}

export type ShotTypeStats = PerSide<Record<ShotType, WinnerErrorCount>>;

const SHOT_TYPES = RECORDED_SHOT_TYPES.map((type) => type.value);

/** Shot type of the last shot of each rally, split into winners and unforced errors. */
export function shotTypeStats(ctxs: PointContext[], stroke: StrokeFilter = 'all'): ShotTypeStats {
  const row = () => Object.fromEntries(SHOT_TYPES.map((t) => [t, { winners: 0, errors: 0 }])) as Record<ShotType, WinnerErrorCount>;
  const out: ShotTypeStats = { A: row(), B: row() };
  for (const { point: p } of ctxs) {
    if (isLuckyBall(p)) continue;
    if (p.end !== 'rally' || !p.rally) continue;
    if (stroke !== 'all' && p.rally.stroke !== stroke) continue;
    const { winnerBy, errorBy } = pointOutcome(p);
    out[(winnerBy ?? errorBy)!][p.rally.shotType][winnerBy ? 'winners' : 'errors']++;
  }
  return out;
}

export interface RallyWinnerStats {
  direction: PerSide<Record<Exclude<ShotDirection, 'none'>, number>>;
  shotType: PerSide<Record<ShotType, number>>;
}

const DIRECTIONS: Exclude<ShotDirection, 'none'>[] = ['crosscourt', 'down_the_line', 'inside_out', 'inside_in', 'middle', 'short_angle'];

/** Rally winners hit with one stroke, by direction (unset = middle) and recorded shot type. */
export function rallyWinnerStats(ctxs: PointContext[], stroke: 'forehand' | 'backhand'): RallyWinnerStats {
  const dirs = () => Object.fromEntries(DIRECTIONS.map((d) => [d, 0])) as RallyWinnerStats['direction']['A'];
  const types = () => Object.fromEntries(SHOT_TYPES.map((t) => [t, 0])) as RallyWinnerStats['shotType']['A'];
  const out: RallyWinnerStats = { direction: { A: dirs(), B: dirs() }, shotType: { A: types(), B: types() } };
  for (const { point: p } of ctxs) {
    if (isLuckyBall(p)) continue;
    if (p.end !== 'rally' || !p.rally || p.rally.stroke !== stroke) continue;
    const { winnerBy } = pointOutcome(p);
    if (!winnerBy) continue;
    out.direction[winnerBy][p.rally.direction === 'none' ? 'middle' : p.rally.direction]++;
    out.shotType[winnerBy][p.rally.shotType]++;
  }
  return out;
}

export type ErrorType = 'net' | 'long' | 'wide' | 'none';
export type StrokeFilter = 'all' | 'forehand' | 'backhand';
export type PositionFilter = 'all' | 'baseline' | 'approach' | 'net';
export type DirectionErrors = Record<ShotDirection, Record<ErrorType | 'total', number>>;

/**
 * Unforced errors (double faults, return errors, rally errors) by error type, filtered by stroke and court position.
 * Position not set counts as baseline; double faults only appear when no stroke is chosen.
 */
export function errorTypeStats(ctxs: PointContext[], stroke: StrokeFilter, position: PositionFilter): PerSide<Record<ErrorType, number>> {
  const empty = (): Record<ErrorType, number> => ({ net: 0, long: 0, wide: 0, none: 0 });
  const out: PerSide<Record<ErrorType, number>> = { A: empty(), B: empty() };
  const directions = errorDirectionStats(ctxs, stroke, position);
  for (const side of ['A', 'B'] as const) {
    for (const counts of Object.values(directions[side])) {
      for (const type of ['net', 'long', 'wide', 'none'] as const) out[side][type] += counts[type];
    }
  }
  return out;
}

export function errorDirectionStats(ctxs: PointContext[], stroke: StrokeFilter, position: PositionFilter): PerSide<DirectionErrors> {
  const empty = (): DirectionErrors => Object.fromEntries(
    [...DIRECTIONS, 'none'].map((direction) => [direction, { net: 0, long: 0, wide: 0, none: 0, total: 0 }]),
  ) as DirectionErrors;
  const out: PerSide<DirectionErrors> = { A: empty(), B: empty() };
  for (const { point: p } of ctxs) {
    if (isLuckyBall(p)) continue;
    const { errorBy } = pointOutcome(p);
    if (!errorBy) continue;
    let s: string;
    let pos: string;
    let type: ErrorType;
    let direction: ShotDirection = 'none';
    if (p.end === 'double_fault') {
      [s, pos, type] = ['serve', 'baseline', p.serves.at(-1)?.fault ?? 'none'];
    } else if (p.end === 'return_error') {
      const r = p.serves.at(-1)?.return;
      [s, pos, type] = [r?.stroke ?? 'none', 'baseline', r?.error ?? 'none'];
      direction = r?.direction ?? 'none';
    } else if (p.rally) {
      [s, pos, type] = [p.rally.stroke, p.rally.position === 'none' ? 'baseline' : p.rally.position, p.rally.error ?? 'none'];
      direction = p.rally.direction;
    } else continue;
    if (stroke !== 'all' && s !== stroke) continue;
    if (position !== 'all' && pos !== position) continue;
    out[errorBy][direction][type]++;
    out[errorBy][direction].total++;
  }
  return out;
}
