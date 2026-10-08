import { FINALISE_REASONS, type FinaliseReason, type Match, type Side } from './types';

export function finalisedMatch(match: Match, winner: Side, reason: FinaliseReason, now: number): Match {
  if (match.deletedAt || match.status !== 'in_progress') throw new Error('Only an in-progress match can be finalised.');
  if (winner !== 'A' && winner !== 'B') throw new Error('Choose who wins the match.');
  if (!FINALISE_REASONS.some((option) => option.value === reason)) throw new Error('Choose a finalise reason.');
  return { ...match, status: 'completed', finishedAt: now, updatedAt: now, finalisation: { winner, reason } };
}

export function finalisationLabel(match: Match, nameA: string, nameB: string): string | undefined {
  if (!match.finalisation) return undefined;
  const { winner, reason } = match.finalisation;
  const reasonLabel = reason === 'player_a_retired' ? `${nameA} retired`
    : reason === 'player_b_retired' ? `${nameB} retired` : "Didn't record the remaining";
  return `${winner === 'A' ? nameA : nameB} wins the match · ${reasonLabel}`;
}
