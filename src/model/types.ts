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
  /** Set by the server: user who added the player (private to them). Unset = added by an admin, visible to everyone. */
  ownerId?: string;
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
export type FinaliseReason = 'player_a_retired' | 'player_b_retired' | 'remaining_unrecorded';

export const FINALISE_REASONS: { value: FinaliseReason; label: string }[] = [
  { value: 'player_a_retired', label: 'Player 1 retired' },
  { value: 'player_b_retired', label: 'Player 2 retired' },
  { value: 'remaining_unrecorded', label: "Didn't record the remaining" },
];

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
  finalisation?: { winner: Side; reason: FinaliseReason };
  createdAt?: number;
  updatedAt: number;
  /** Set by the server: the user who recorded the match. Unset = created on this device, not synced yet. */
  ownerId?: string;
  ownerName?: string;
}

export type ServeResult = 'ace' | 'fault' | 'in' | 'return_winner' | 'return_error';
export type ServeLocation = 'wide' | 'body' | 't' | 'none';
export type ServeType = 'flat' | 'slice' | 'kick' | 'none';
export type ReturnStroke = 'forehand' | 'backhand' | 'none';
export type ReturnDirection = 'crosscourt' | 'down_the_line' | 'inside_out' | 'none';
export type ReturnError = 'net' | 'long' | 'wide' | 'none';

export interface ReturnDetail {
  stroke: ReturnStroke;
  direction: ReturnDirection;
  /** Only for an unforced return error. */
  error?: ReturnError;
}

export interface Serve {
  result: ServeResult;
  location: ServeLocation;
  type: ServeType;
  /** Only for a fault. */
  fault?: ReturnError;
  /** Set when the point ended on the return (Return Ace / Unforced Error Return). */
  return?: ReturnDetail;
}

export type PointEnd = 'ace' | 'double_fault' | 'return_winner' | 'return_error' | 'rally' | 'unrecorded';

/** How a rally ended: a winner/forced error by one player, or an unforced error. */
export type RallyEnding = 'server_winner' | 'returner_winner' | 'server_error' | 'returner_error';
export type Stroke = 'forehand' | 'backhand' | 'none';
export type ShotDirection = 'crosscourt' | 'down_the_line' | 'inside_out' | 'inside_in' | 'middle' | 'short_angle' | 'none';
export type ShotType = 'topspin' | 'slice' | 'volley' | 'smash' | 'lob' | 'dropshot' | 'none';
export type ShotPosition = 'baseline' | 'approach' | 'net' | 'none';

/** Details of the last shot of a rally. */
export interface RallyDetail {
  /** Number of shots; null when not counted. */
  count: number | null;
  ending: RallyEnding;
  stroke: Stroke;
  /** Only for unforced errors. */
  error?: ReturnError;
  /** Only for winners / forced errors. */
  lucky?: boolean;
  direction: ShotDirection;
  shotType: ShotType;
  position: ShotPosition;
}

export const rallyWonByServer = (e: RallyEnding) => e === 'server_winner' || e === 'returner_error';

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
  /** Set when the serve went in and the point was played out. */
  rally?: RallyDetail;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PublicStats {
  match: Match;
  points: Point[];
  nameA: string;
  nameB: string;
}

export const SERVE_RESULTS: { value: ServeResult; label: string }[] = [
  { value: 'ace', label: 'Ace (Unreturnable)' },
  { value: 'fault', label: 'Fault' },
  { value: 'return_winner', label: 'Return Ace' },
  { value: 'return_error', label: 'Return error' },
  { value: 'in', label: 'Serve in' },
];

export const RETURN_STROKES: { value: Exclude<ReturnStroke, 'none'>; label: string }[] = [
  { value: 'forehand', label: 'Forehand return' },
  { value: 'backhand', label: 'Backhand return' },
];

export const RETURN_DIRECTIONS: { value: Exclude<ReturnDirection, 'none'>; label: string }[] = [
  { value: 'crosscourt', label: 'Crosscourt' },
  { value: 'down_the_line', label: 'Down the line' },
  { value: 'inside_out', label: 'Inside out' },
];

export const RETURN_ERRORS: { value: Exclude<ReturnError, 'none'>; label: string }[] = [
  { value: 'net', label: 'Net' },
  { value: 'long', label: 'Long' },
  { value: 'wide', label: 'Wide' },
];

export const STROKES: { value: Exclude<Stroke, 'none'>; label: string }[] = [
  { value: 'forehand', label: 'Forehand' },
  { value: 'backhand', label: 'Backhand' },
];

export const SHOT_DIRECTIONS: { value: Exclude<ShotDirection, 'none'>; label: string }[] = [
  { value: 'crosscourt', label: 'Cross court' },
  { value: 'down_the_line', label: 'Down the line' },
  { value: 'inside_out', label: 'Inside out' },
  { value: 'inside_in', label: 'Inside in' },
  { value: 'middle', label: 'Middle' },
  { value: 'short_angle', label: 'Short angle' },
];

export const SHOT_TYPES: { value: Exclude<ShotType, 'none'>; label: string }[] = [
  { value: 'topspin', label: 'Topspin' },
  { value: 'slice', label: 'Slice' },
  { value: 'volley', label: 'Volley' },
  { value: 'smash', label: 'Smash' },
  { value: 'lob', label: 'Lob' },
  { value: 'dropshot', label: 'Dropshot' },
];

export const SHOT_POSITIONS: { value: Exclude<ShotPosition, 'none'>; label: string }[] = [
  { value: 'baseline', label: 'Baseline' },
  { value: 'approach', label: 'Approach' },
  { value: 'net', label: 'Net' },
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
