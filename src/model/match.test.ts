import { describe, expect, it } from 'vitest';
import { finalisationLabel, finalisedMatch, finaliseReasonLabel } from './match';
import { FINALISE_REASONS, type Match, type Side } from './types';
import { computeScore } from '../engine/score';

const match: Match = {
  id: 'match', playerAId: 'alice', playerBId: 'bob', ruleSetId: 'standard', ruleSetName: 'Standard',
  rules: { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, tiebreakPoints: 7, noAd: false,
    finalSet: 'regular', finalSetTiebreakPoints: 7, matchTiebreakPoints: 10 },
  firstServer: 'A', status: 'in_progress', startedAt: 10, updatedAt: 10, ownerId: 'owner',
};

describe('manual match finalisation', () => {
  for (const winner of ['A', 'B'] as Side[]) {
    for (const { value: reason } of FINALISE_REASONS) {
      it(`saves winner ${winner} and reason ${reason} without changing rules or players`, () => {
        const result = finalisedMatch(match, winner, reason, 100);
        expect(result).toEqual({ ...match, status: 'completed', finishedAt: 100, updatedAt: 100,
          finalisation: { winner, reason } });
        expect(match.status).toBe('in_progress');
        expect(match.finalisation).toBeUndefined();
      });
    }
  }

  it('does not fabricate a scoring-engine winner or any remaining points', () => {
    const winners: Side[] = ['A', 'A', 'B'];
    const before = computeScore(match.rules, 'A', winners);
    finalisedMatch(match, 'B', 'remaining_unrecorded', 100);
    expect(computeScore(match.rules, 'A', winners)).toEqual(before);
    expect(before.winner).toBeNull();
    expect(winners).toEqual(['A', 'A', 'B']);
  });

  it('rejects matches that are not live and in progress', () => {
    for (const status of ['scheduled', 'completed', 'abandoned'] as const) {
      expect(() => finalisedMatch({ ...match, status }, 'A', 'player_b_retired', 100)).toThrow('in-progress');
    }
    expect(() => finalisedMatch({ ...match, deletedAt: 50 }, 'A', 'player_b_retired', 100)).toThrow('in-progress');
  });

  it('uses the player names for retirement reasons', () => {
    expect(finaliseReasonLabel('player_a_retired', 'Roger Federer', 'Rafael Nadal')).toBe('Roger Federer retired');
    expect(finaliseReasonLabel('player_b_retired', 'Roger Federer', 'Rafael Nadal')).toBe('Rafael Nadal retired');
    expect(finaliseReasonLabel('remaining_unrecorded', 'Roger Federer', 'Rafael Nadal')).toBe("Didn't record the remaining");
    expect(finalisationLabel(finalisedMatch(match, 'B', 'player_a_retired', 100), 'Alice', 'Bob'))
      .toBe('Bob wins the match · Alice retired');
    expect(finalisationLabel(finalisedMatch(match, 'A', 'player_b_retired', 100), 'Alice', 'Bob'))
      .toBe('Alice wins the match · Bob retired');
    expect(finalisationLabel(finalisedMatch(match, 'A', 'remaining_unrecorded', 100), 'Alice', 'Bob'))
      .toBe("Alice wins the match · Didn't record the remaining");
    expect(finalisationLabel(match, 'Alice', 'Bob')).toBeUndefined();
  });
});
