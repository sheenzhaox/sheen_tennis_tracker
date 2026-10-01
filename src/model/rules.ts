import type { RuleSet, Rules } from './types';

export const DEFAULT_RULES: Rules = {
  bestOf: 3,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  noAd: false,
  finalSet: 'regular',
  finalSetTiebreakPoints: 7,
  matchTiebreakPoints: 10,
};

const builtIn = (id: string, name: string, overrides: Partial<Rules>): RuleSet => ({
  id: `builtin:${id}`,
  name,
  builtIn: true,
  rules: { ...DEFAULT_RULES, ...overrides },
});

export const BUILT_IN_RULE_SETS: RuleSet[] = [
  builtIn('standard-bo3', 'Standard - best of 3', {}),
  builtIn('bo3-match-tb', 'Best of 3 - match tiebreak', { finalSet: 'matchTiebreak' }),
  builtIn('bo3-noad-match-tb', 'Best of 3 - no-ad, match tiebreak', { noAd: true, finalSet: 'matchTiebreak' }),
  builtIn('bo5-slam', 'Best of 5 - Grand Slam', { bestOf: 5, finalSetTiebreakPoints: 10 }),
  builtIn('one-set', 'One set', { bestOf: 1 }),
  builtIn('pro-set', 'Pro set (8 games)', { bestOf: 1, gamesPerSet: 8, tiebreakAt: 8 }),
  builtIn('short-sets', 'Short sets (to 4) - match tiebreak', {
    gamesPerSet: 4,
    tiebreakAt: 4,
    finalSet: 'matchTiebreak',
  }),
];

export const DEFAULT_RULE_SET_ID = BUILT_IN_RULE_SETS[0].id;

export function describeRules(r: Rules): string {
  const parts: string[] = [];
  parts.push(r.bestOf === 1 ? 'One set' : `Best of ${r.bestOf} sets`);
  parts.push(`${r.gamesPerSet}-game sets`);
  parts.push(
    r.tiebreakAt === null ? 'no tiebreak' : `tiebreak at ${r.tiebreakAt}-${r.tiebreakAt} to ${r.tiebreakPoints}`,
  );
  parts.push(r.noAd ? 'no-ad' : 'advantage');

  if (r.finalSet === 'matchTiebreak') {
    parts.push(`deciding set: match tiebreak to ${r.matchTiebreakPoints}`);
  } else if (r.finalSet === 'noTiebreak') {
    parts.push('deciding set: no tiebreak');
  } else if (r.tiebreakAt !== null && r.finalSetTiebreakPoints !== r.tiebreakPoints) {
    parts.push(`deciding set tiebreak to ${r.finalSetTiebreakPoints}`);
  }
  return parts.join(', ');
}

const isInt = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

export function validateRules(r: Rules): string[] {
  const errors: string[] = [];
  if (![1, 3, 5].includes(r.bestOf)) errors.push('Best of must be 1, 3 or 5.');
  if (!isInt(r.gamesPerSet, 1, 12)) errors.push('Games per set must be 1-12.');
  if (r.tiebreakAt !== null && !isInt(r.tiebreakAt, r.gamesPerSet - 1, r.gamesPerSet)) {
    errors.push('Tiebreak must be at games-per-set or one less.');
  }
  if (!isInt(r.tiebreakPoints, 3, 21)) errors.push('Tiebreak points must be 3-21.');
  if (!isInt(r.finalSetTiebreakPoints, 3, 21)) errors.push('Deciding-set tiebreak points must be 3-21.');
  if (!isInt(r.matchTiebreakPoints, 3, 21)) errors.push('Match tiebreak points must be 3-21.');
  return errors;
}
