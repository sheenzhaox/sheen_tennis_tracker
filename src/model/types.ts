export type Handedness = 'right' | 'left';
export type Backhand = 'one-handed' | 'two-handed';

/** Fields used by cloud sync; deleted records are kept as tombstones so deletes propagate. */
export interface Syncable {
  deletedAt?: number;
  dirty?: 0 | 1;
}

export interface Player extends Syncable {
  id: string;
  name: string;
  handedness?: Handedness;
  backhand?: Backhand;
  rating?: string;
  club?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type FinalSetFormat = 'regular' | 'matchTiebreak' | 'noTiebreak';

export interface Rules {
  bestOf: 1 | 3 | 5;
  /** Games needed to win a set (win by 2 unless a tiebreak decides it). */
  gamesPerSet: number;
  /** Games each at which a tiebreak is played; null = no tiebreak (advantage sets). */
  tiebreakAt: number | null;
  tiebreakPoints: number;
  noAd: boolean;
  /** Format of the deciding set. */
  finalSet: FinalSetFormat;
  finalSetTiebreakPoints: number;
  matchTiebreakPoints: number;
}

export interface RuleSet extends Syncable {
  id: string;
  name: string;
  rules: Rules;
  builtIn: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'abandoned';
export type Surface = 'hard' | 'clay' | 'synthetic_grass' | 'grass';
export type Side = 'A' | 'B';

export const SURFACES: { value: Surface; label: string }[] = [
  { value: 'hard', label: 'Hard' },
  { value: 'clay', label: 'Clay' },
  { value: 'synthetic_grass', label: 'Synthetic grass' },
  { value: 'grass', label: 'Grass' },
];

export interface Match extends Syncable {
  id: string;
  /** Match day as YYYY-MM-DD (local). */
  date?: string;
  playerAId: string;
  playerBId: string;
  ruleSetId: string;
  ruleSetName: string;
  /** Snapshot so later edits to the rule set don't change this match. */
  rules: Rules;
  /** Chosen on the start screen; unset while scheduled. */
  firstServer?: Side;
  surface?: Surface;
  event?: string;
  round?: string;
  venue?: string;
  notes?: string;
  status: MatchStatus;
  /** Timestamp when "Start match" was pressed. */
  startedAt?: number;
  finishedAt?: number;
  createdAt?: number;
  updatedAt: number;
}

export type ServeResult = 'ace' | 'fault' | 'in' | 'return_winner' | 'return_error';
export type ServeLocation = 'wide' | 'body' | 't' | 'none';
export type ServeType = 'flat' | 'slice' | 'kick' | 'none';

export interface Serve {
  result: ServeResult;
  location: ServeLocation;
  type: ServeType;
}

export type PointEnd = 'ace' | 'double_fault' | 'return_winner' | 'return_error' | 'rally';

export interface Point extends Syncable {
  id: string;
  matchId: string;
  /** 0-based order within the match. */
  seq: number;
  server: Side;
  winner: Side;
  /** One entry per serve hit (1 or 2). */
  serves: Serve[];
  end: PointEnd;
  createdAt: number;
  updatedAt: number;
}

export const SERVE_RESULTS: { value: ServeResult; label: string }[] = [
  { value: 'ace', label: 'Ace (Unreturnable)' },
  { value: 'fault', label: 'Fault' },
  { value: 'in', label: 'Serve in' },
  { value: 'return_winner', label: 'Return Ace' },
  { value: 'return_error', label: 'Unforced Error Return' },
];

export const SERVE_LOCATIONS: { value: Exclude<ServeLocation, 'none'>; label: string }[] = [
  { value: 'wide', label: 'Wide' },
  { value: 'body', label: 'Body' },
  { value: 't', label: 'T' },
];

export const SERVE_TYPES: { value: Exclude<ServeType, 'none'>; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'slice', label: 'Slice' },
  { value: 'kick', label: 'Kick' },
];
