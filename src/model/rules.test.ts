import { describe, expect, it } from 'vitest';
import { BUILT_IN_RULE_SETS, DEFAULT_RULES, describeRules, validateRules } from './rules';

describe('rules', () => {
  it('built-in rule sets are valid and have unique ids', () => {
    for (const r of BUILT_IN_RULE_SETS) expect(validateRules(r.rules), r.name).toEqual([]);
    expect(new Set(BUILT_IN_RULE_SETS.map((r) => r.id)).size).toBe(BUILT_IN_RULE_SETS.length);
  });

  it('rejects invalid values', () => {
    expect(validateRules({ ...DEFAULT_RULES, gamesPerSet: 0 })).not.toEqual([]);
    expect(validateRules({ ...DEFAULT_RULES, tiebreakAt: 4 })).not.toEqual([]);
    expect(validateRules({ ...DEFAULT_RULES, matchTiebreakPoints: 2.5 })).not.toEqual([]);
  });

  it('describes rules', () => {
    expect(describeRules(DEFAULT_RULES)).toBe('Best of 3 sets, 6-game sets, tiebreak at 6-6 to 7, advantage');
    expect(describeRules({ ...DEFAULT_RULES, noAd: true, finalSet: 'matchTiebreak' })).toContain(
      'deciding set: match tiebreak to 10',
    );
  });
});
