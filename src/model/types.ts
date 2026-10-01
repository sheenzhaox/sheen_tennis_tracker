export type Handedness = 'right' | 'left';
export type Backhand = 'one-handed' | 'two-handed';

export interface Player {
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

export interface RuleSet {
  id: string;
  name: string;
  rules: Rules;
  builtIn: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export type MatchStatus = 'in_progress' | 'completed' | 'abandoned';
export type Surface = 'hard' | 'clay' | 'grass' | 'carpet' | 'other';
export type Side = 'A' | 'B';

export interface Match {
  id: string;
  playerAId: string;
  playerBId: string;
  ruleSetId: string;
  ruleSetName: string;
  /** Snapshot so later edits to the rule set don't change this match. */
  rules: Rules;
  firstServer: Side;
  surface?: Surface;
  indoor?: boolean;
  venue?: string;
  notes?: string;
  status: MatchStatus;
  startedAt: number;
  finishedAt?: number;
  updatedAt: number;
}
