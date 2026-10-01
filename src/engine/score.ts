import type { Rules, Side } from '../model/types';

export interface SetScore {
  a: number;
  b: number;
  /** Tiebreak points, when the set was decided by a tiebreak. */
  tiebreak?: { a: number; b: number };
  /** The set was a match tiebreak played instead of a full set. */
  matchTiebreak?: boolean;
}

export interface ScoreState {
  /** Completed sets. */
  sets: SetScore[];
  /** Games in the current set. */
  games: { a: number; b: number };
  /** Points in the current game or tiebreak. */
  points: { a: number; b: number };
  setsWon: { a: number; b: number };
  inTiebreak: boolean;
  isMatchTiebreak: boolean;
  /** Server of the next point. */
  server: Side;
  side: 'deuce' | 'ad';
  winner: Side | null;
}

export const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');
export const sideKey = (s: Side): 'a' | 'b' => (s === 'A' ? 'a' : 'b');

interface SetFormat {
  matchTiebreak: boolean;
  tiebreakAt: number | null;
  tiebreakPoints: number;
}

function setFormat(rules: Rules, setIndex: number): SetFormat {
  const deciding = setIndex === rules.bestOf - 1;
  if (deciding && rules.finalSet === 'matchTiebreak') {
    return { matchTiebreak: true, tiebreakAt: 0, tiebreakPoints: rules.matchTiebreakPoints };
  }
  return {
    matchTiebreak: false,
    tiebreakAt: deciding && rules.finalSet === 'noTiebreak' ? null : rules.tiebreakAt,
    tiebreakPoints: deciding ? rules.finalSetTiebreakPoints : rules.tiebreakPoints,
  };
}

/** Replays point winners under the match rules. Points after the match is decided are ignored. */
export function computeScore(rules: Rules, firstServer: Side, winners: Side[]): ScoreState {
  const sets: SetScore[] = [];
  let games = { a: 0, b: 0 };
  let points = { a: 0, b: 0 };
  const setsWon = { a: 0, b: 0 };
  let winner: Side | null = null;
  // Server at the start of the current game; a tiebreak counts as one game for rotation.
  let gameServer = firstServer;
  const setsToWin = Math.ceil(rules.bestOf / 2);

  const inTiebreak = () => {
    const f = setFormat(rules, sets.length);
    return f.matchTiebreak || (f.tiebreakAt !== null && games.a === f.tiebreakAt && games.b === f.tiebreakAt);
  };

  for (const w of winners) {
    if (winner) break;
    const f = setFormat(rules, sets.length);
    const tb = inTiebreak();
    const W = sideKey(w);
    const L = sideKey(other(w));
    points = { ...points, [W]: points[W] + 1 };

    const gameWon = tb
      ? points[W] >= f.tiebreakPoints && points[W] - points[L] >= 2
      : rules.noAd
        ? points[W] >= 4
        : points[W] >= 4 && points[W] - points[L] >= 2;
    if (!gameWon) continue;

    const tbScore = tb ? points : undefined;
    points = { a: 0, b: 0 };
    gameServer = other(gameServer);
    games = { ...games, [W]: games[W] + 1 };

    const setWon = tb || (games[W] >= rules.gamesPerSet && games[W] - games[L] >= 2);
    if (!setWon) continue;

    sets.push({ ...games, tiebreak: tbScore, matchTiebreak: f.matchTiebreak || undefined });
    games = { a: 0, b: 0 };
    setsWon[W]++;
    if (setsWon[W] >= setsToWin) winner = w;
  }

  const tb = !winner && inTiebreak();
  const played = points.a + points.b;
  // In a tiebreak the first server serves once, then players alternate every two points.
  const server = tb && Math.floor((played + 1) / 2) % 2 === 1 ? other(gameServer) : gameServer;

  return {
    sets,
    games,
    points,
    setsWon,
    inTiebreak: tb,
    isMatchTiebreak: tb && setFormat(rules, sets.length).matchTiebreak,
    server,
    side: played % 2 === 0 ? 'deuce' : 'ad',
    winner,
  };
}

const GAME_POINTS = ['0', '15', '30', '40'];

/** Display labels for the current game, e.g. 30 / 15, 40 / AD, or tiebreak numbers. */
export function pointLabels(s: ScoreState, noAd: boolean): { a: string; b: string } {
  const { a, b } = s.points;
  if (s.inTiebreak) return { a: String(a), b: String(b) };
  if (a >= 3 && b >= 3 && !noAd) {
    if (a === b) return { a: '40', b: '40' };
    return a > b ? { a: 'AD', b: '40' } : { a: '40', b: 'AD' };
  }
  return { a: GAME_POINTS[Math.min(a, 3)], b: GAME_POINTS[Math.min(b, 3)] };
}
