import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db } from '../../storage/db';
import type { Match } from '../../model/types';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, matchSortKey, surfaceLabel } from '../format';

export default function MatchesPage() {
  const matches = useLiveQuery(async () => {
    const all = await db.matches.filter((m) => !m.deletedAt).toArray();
    return all.sort((x, y) => matchSortKey(y) - matchSortKey(x));
  }, []);
  const names = usePlayerNames();

  if (matches === undefined) return null;
  const scheduled = matches.filter((m) => m.status === 'scheduled');
  const inProgress = matches.filter((m) => m.status === 'in_progress');
  const finished = matches.filter((m) => m.status === 'completed' || m.status === 'abandoned');

  const item = (m: Match) => (
    <li key={m.id}>
      <a href={`#/match/${m.id}`}>
        <strong>
          {names.get(m.playerAId) ?? 'Unknown'} vs {names.get(m.playerBId) ?? 'Unknown'}
        </strong>
        <span className="muted">
          {[formatMatchDay(m), surfaceLabel(m.surface), m.event, m.ruleSetName].filter(Boolean).join(' · ')}
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
      </main>
    </>
  );
}
