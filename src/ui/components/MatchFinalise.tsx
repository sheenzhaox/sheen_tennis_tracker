import { useState } from 'react';
import { FINALISE_REASONS, type FinaliseReason, type Match, type Side } from '../../model/types';
import { finaliseMatch } from '../../storage/db';
import { finaliseReasonLabel } from '../../model/match';

export default function MatchFinalise({ match, nameA, nameB, disabled = false, compact = false }: {
  match: Match; nameA: string; nameB: string; disabled?: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [reason, setReason] = useState<FinaliseReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (match.status !== 'in_progress') return null;

  function cancel() {
    setOpen(false);
    setWinner(null);
    setReason(null);
    setError('');
  }

  async function save() {
    if (!winner || !reason || busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await finaliseMatch(match.id, winner, reason);
      cancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="match-finalise">
      {!open ? (
        <button type="button" className={`btn ${compact ? 'btn-compact' : ''}`} aria-label="Finalise match"
          disabled={disabled} onClick={() => setOpen(true)}>{compact ? 'Finalise' : 'Finalise match'}</button>
      ) : (
        <div className="form" role="group" aria-label="Finalise match">
          {!winner ? (
            <fieldset disabled={busy || disabled}>
              <legend>Who wins the match?</legend>
              <div className="choice-grid two">
                <button type="button" className="btn" onClick={() => setWinner('A')}>Player 1: {nameA}</button>
                <button type="button" className="btn" onClick={() => setWinner('B')}>Player 2: {nameB}</button>
              </div>
            </fieldset>
          ) : (
            <>
              <p className="muted">Winner: {winner === 'A' ? nameA : nameB}</p>
              <fieldset className="form" disabled={busy || disabled}>
                <legend>Finalise reason</legend>
                {FINALISE_REASONS.map((option) => (
                  <button key={option.value} type="button" className={`btn ${reason === option.value ? 'btn-primary' : ''}`}
                    aria-pressed={reason === option.value} onClick={() => setReason(option.value)}>
                    {finaliseReasonLabel(option.value, nameA, nameB)}
                  </button>
                ))}
              </fieldset>
              <p className="muted">Recorded points are kept. No remaining points will be added.</p>
              <button type="button" className="btn btn-primary" disabled={!reason || busy || disabled} onClick={() => void save()}>
                {busy ? 'Finalising...' : 'Confirm finalisation'}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => { setWinner(null); setReason(null); }}>Back</button>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="btn" disabled={busy} onClick={cancel}>Cancel</button>
        </div>
      )}
    </div>
  );
}
