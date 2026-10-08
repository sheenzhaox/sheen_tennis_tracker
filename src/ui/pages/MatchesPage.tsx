import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import MatchFinalise from '../components/MatchFinalise';
import { db, deleteRecord } from '../../storage/db';
import { finalisationLabel } from '../../model/match';
import type { Match } from '../../model/types';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, matchSortKey, surfaceLabel } from '../format';
import { canEditMatch, useUser } from '../user';

export default function MatchesPage() {
  const user = useUser();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const all = useLiveQuery(async () => {
    const all = await db.matches.filter((m) => !m.deletedAt).toArray();
    return all.sort((x, y) => matchSortKey(y) - matchSortKey(x));
  }, []);
  const names = usePlayerNames();

  if (all === undefined) return null;
  const matches = all.filter((m) => canEditMatch(user, m));
  const shared = all.filter((m) => !canEditMatch(user, m));
  const scheduled = matches.filter((m) => m.status === 'scheduled');
  const inProgress = matches.filter((m) => m.status === 'in_progress');
  const finished = matches.filter((m) => m.status === 'completed' || m.status === 'abandoned');
  const byOther = (m: Match) => m.ownerId && m.ownerId !== user.id;

  async function remove(m: Match) {
    if (deleting || !canEditMatch(user, m)) return;
    if (!confirm(`Delete ${names.get(m.playerAId) ?? 'Player 1'} vs ${names.get(m.playerBId) ?? 'Player 2'} and all its recorded data? This cannot be undone.`)) return;
    setDeleting(m.id);
    setError('');
    try {
      await deleteRecord('matches', m.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  const item = (m: Match) => (
    <li key={m.id} className="match-list-item">
      <a href={`#/match/${m.id}`}>
        <strong>
          {names.get(m.playerAId) ?? 'Unknown'} vs {names.get(m.playerBId) ?? 'Unknown'}
        </strong>
        <span className="muted">
          {[formatMatchDay(m), surfaceLabel(m.surface), m.event, m.ruleSetName, byOther(m) && `by ${m.ownerName ?? 'unknown'}`]
            .filter(Boolean)
            .join(' · ')}
          {m.status === 'abandoned' ? ' · abandoned' : ''}
          {shared.includes(m) && m.status !== 'completed' ? ` · ${m.status.replace('_', ' ')}` : ''}
        </span>
        {m.finalisation && <span className="muted">{finalisationLabel(m, names.get(m.playerAId) ?? 'Player 1', names.get(m.playerBId) ?? 'Player 2')}</span>}
      </a>
      {canEditMatch(user, m) && (
        <div className="match-list-actions">
          <MatchFinalise match={m} nameA={names.get(m.playerAId) ?? 'Player 1'} nameB={names.get(m.playerBId) ?? 'Player 2'} disabled={deleting !== null} compact />
          <button type="button" className="btn btn-danger btn-compact" aria-label="Delete match"
            disabled={deleting !== null} onClick={() => void remove(m)}>
            {deleting === m.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      )}
    </li>
  );

  return (
    <>
      <Header title="Matches" back="/" />
      <main className="page">
        {error && <p className="error" role="alert">{error}</p>}
        <a className="btn btn-primary btn-big" href="#/match/new">
          + New match
        </a>
        {scheduled.length > 0 && (
          <>
            <h2>Not started</h2>
            <ul className="list">{scheduled.map(item)}</ul>
          </>
        )}
        <h2>In progress</h2>
        {inProgress.length === 0 ? (
          <p className="muted">No match in progress.</p>
        ) : (
          <ul className="list">{inProgress.map(item)}</ul>
        )}
        <h2>Finished</h2>
        {finished.length === 0 ? <p className="muted">No finished matches yet.</p> : <ul className="list">{finished.map(item)}</ul>}
        {shared.length > 0 && (
          <>
            <h2>Shared with me</h2>
            <ul className="list">{shared.map(item)}</ul>
          </>
        )}
      </main>
    </>
  );
}
