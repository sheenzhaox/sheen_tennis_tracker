import { useState } from 'react';
import Header from '../components/Header';
import { deleteRecord, saveRecord } from '../../storage/db';
import { describeRules } from '../../model/rules';
import type { Match, Side } from '../../model/types';
import { navigate } from '../router';
import { formatMatchDay, surfaceLabel } from '../format';
import { isAdmin, useUser } from '../user';

interface Props {
  match: Match;
  nameA: string;
  nameB: string;
}

/** Step 2 of a match: choose the first server and record the start time. */
export default function StartMatchPage({ match, nameA, nameB }: Props) {
  const user = useUser();
  const [firstServer, setFirstServer] = useState<Side | null>(match.firstServer ?? null);
  const info = [match.event, match.round, match.venue].filter(Boolean).join(' · ');

  async function start() {
    if (!firstServer) return;
    await saveRecord<Match>('matches', { ...match, firstServer, status: 'in_progress', startedAt: Date.now() });
  }

  async function remove() {
    if (!confirm('Delete this match?')) return;
    await deleteRecord('matches', match.id);
    navigate('/match');
  }

  return (
    <>
      <Header title="Ready to start" back="/match" />
      <main className="page">
        <section className="summary">
          <p className="summary-players">
            {nameA} <span className="muted">vs</span> {nameB}
          </p>
          <p className="muted">
            {formatMatchDay(match)} · {surfaceLabel(match.surface)}
            {info && (
              <>
                <br />
                {info}
              </>
            )}
          </p>
          <p>
            <strong>{match.ruleSetName}</strong>
            <br />
            <span className="muted">{describeRules(match.rules)}</span>
          </p>
          <a href={`#/match/${match.id}/edit`}>Edit setup</a>
        </section>

        <h2>Who serves first?</h2>
        <div className="serve-choice">
          {(['A', 'B'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={`btn btn-big ${firstServer === side ? 'btn-primary' : ''}`}
              aria-pressed={firstServer === side}
              onClick={() => setFirstServer(side)}
            >
              {side === 'A' ? nameA : nameB}
            </button>
          ))}
        </div>

        <button className="btn btn-primary btn-big start-btn" type="button" disabled={!firstServer} onClick={() => void start()}>
          Start match
        </button>
        {isAdmin(user) && (
          <button className="btn btn-danger" type="button" onClick={() => void remove()}>
            Delete match
          </button>
        )}
      </main>
    </>
  );
}
