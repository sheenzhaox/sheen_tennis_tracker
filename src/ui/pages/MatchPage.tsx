import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import StartMatchPage from './StartMatchPage';
import { db, deleteRecord, isLive } from '../../storage/db';
import { describeRules } from '../../model/rules';
import { navigate } from '../router';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, formatTime, surfaceLabel } from '../format';

export default function MatchPage({ id }: { id: string }) {
  const match = useLiveQuery(async () => {
    const m = await db.matches.get(id);
    return isLive(m) ? m : null;
  }, [id]);
  const names = usePlayerNames();

  if (match === undefined) return null;
  if (match === null) {
    return (
      <>
        <Header title="Match" back="/match" />
        <main className="page">
          <p>Match not found.</p>
        </main>
      </>
    );
  }

  const a = names.get(match.playerAId) ?? 'Player A';
  const b = names.get(match.playerBId) ?? 'Player B';
  if (match.status === 'scheduled') return <StartMatchPage match={match} nameA={a} nameB={b} />;
  const info = [match.event, match.round, match.venue].filter(Boolean).join(' · ');

  async function remove() {
    if (!confirm('Delete this match and all its recorded data?')) return;
    await deleteRecord('matches', id);
    navigate('/match');
  }

  return (
    <>
      <Header title={`${a} vs ${b}`} back="/match" />
      <main className="page">
        <p>
          <strong>{match.ruleSetName}</strong>
          <br />
          <span className="muted">{describeRules(match.rules)}</span>
        </p>
        <p className="muted">
          {formatMatchDay(match)} · {surfaceLabel(match.surface)}
          {match.startedAt ? ` · started ${formatTime(match.startedAt)}` : ''}
          {match.firstServer ? ` · first server ${match.firstServer === 'A' ? a : b}` : ''}
          {info && (
            <>
              <br />
              {info}
            </>
          )}
        </p>
        <div className="placeholder">Point-by-point recording comes next (Phase 2-3).</div>
        <button className="btn btn-danger" type="button" onClick={remove}>
          Delete match
        </button>
      </main>
    </>
  );
}
