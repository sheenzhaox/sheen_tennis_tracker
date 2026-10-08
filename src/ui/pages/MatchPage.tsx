import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import PointLog from '../components/PointLog';
import ScoreTable from '../components/ScoreTable';
import MatchAccess from '../components/MatchAccess';
import StartMatchPage from './StartMatchPage';
import MatchTracker from './MatchTracker';
import { db, deleteRecord, isLive, pointsForMatch } from '../../storage/db';
import { computeScore } from '../../engine/score';
import { describeRules } from '../../model/rules';
import { finalisationLabel } from '../../model/match';
import type { Match } from '../../model/types';
import { navigate } from '../router';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, formatTime, shortName, surfaceLabel } from '../format';
import { canEditMatch, isAdmin, useUser } from '../user';

function ReadOnlyScore({ match, nameA, nameB }: { match: Match; nameA: string; nameB: string }) {
  const points = useLiveQuery(() => pointsForMatch(match.id), [match.id]);
  if (!points) return null;
  const score = computeScore(match.rules, match.firstServer ?? 'A', points.map((p) => p.winner));
  return (
    <section>
      <p className="muted">
        View only · recorded by {match.ownerName ?? 'unknown'}
        {match.status === 'scheduled' ? ' · not started' : ''}
      </p>
      {match.finalisation && <p>{finalisationLabel(match, nameA, nameB)}</p>}
      <ScoreTable score={score} noAd={match.rules.noAd} nameA={nameA} nameB={nameB}
        finished={match.status === 'completed' || match.status === 'abandoned'} winner={match.finalisation?.winner} />
    </section>
  );
}

export default function MatchPage({ id }: { id: string }) {
  const user = useUser();
  const match = useLiveQuery(async () => {
    const m = await db.matches.get(id);
    return isLive(m) ? m : null;
  }, [id]);
  const names = usePlayerNames();
  const [detailsOpen, setDetailsOpen] = useState(false);

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
  const editable = canEditMatch(user, match);
  if (match.status === 'scheduled' && editable) return <StartMatchPage match={match} nameA={a} nameB={b} />;
  const info = [match.event, match.round, match.venue].filter(Boolean).join(' · ');

  async function remove() {
    if (!confirm('Delete this match and all its recorded data?')) return;
    await deleteRecord('matches', id);
    navigate('/match');
  }

  return (
    <>
      <Header title={`${shortName(a)} vs ${shortName(b)}`} back="/match" action={<a href={`#/match/${id}/stats`}>Stats</a>} />
      <main className="page">
        {editable ? <MatchTracker match={match} nameA={a} nameB={b} /> : <ReadOnlyScore match={match} nameA={a} nameB={b} />}
        <details className="match-details" onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
          <summary>Match details</summary>
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
          <h2>Point by point</h2>
          {detailsOpen && <PointLog match={match} nameA={a} nameB={b} />}
          {isAdmin(user) && detailsOpen && <MatchAccess match={match} />}
          {isAdmin(user) && (
            <button className="btn btn-danger" type="button" onClick={remove}>
              Delete match
            </button>
          )}
        </details>
      </main>
    </>
  );
}
