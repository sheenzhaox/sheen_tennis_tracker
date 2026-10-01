import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db } from '../../storage/db';
import type { Match } from '../../model/types';
import { usePlayerNames } from '../hooks';
import { formatDate } from '../format';

export default function MatchesPage() {
  const matches = useLiveQuery(
    () => db.matches.orderBy('startedAt').reverse().filter((m) => !m.deletedAt).toArray(),
    [],
  );
  const names = usePlayerNames();

  if (matches === undefined) return null;
  const inProgress = matches.filter((m) => m.status === 'in_progress');
  const finished = matches.filter((m) => m.status !== 'in_progress');

  const item = (m: Match) => (
    <li key={m.id}>
      <a href={`#/match/${m.id}`}>
        <strong>
          {names.get(m.playerAId) ?? 'Unknown'} vs {names.get(m.playerBId) ?? 'Unknown'}
        </strong>
        <span className="muted">
          {formatDate(m.startedAt)} · {m.ruleSetName}
          {m.status === 'abandoned' ? ' · abandoned' : ''}
        </span>
      </a>
    </li>
  );

  return (
    <>
      <Header title="Matches" back="/" />
      <main className="page">
        <a className="btn btn-primary btn-big" href="#/match/new">
          + Start new match
        </a>
        <h2>In progress</h2>
        {inProgress.length === 0 ? (
          <p className="muted">No match in progress.</p>
        ) : (
          <ul className="list">{inProgress.map(item)}</ul>
        )}
        <h2>Finished</h2>
        {finished.length === 0 ? <p className="muted">No finished matches yet.</p> : <ul className="list">{finished.map(item)}</ul>}
      </main>
    </>
  );
}
