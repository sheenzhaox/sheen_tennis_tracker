import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ScoreTable from '../components/ScoreTable';
import { computeScore, other } from '../../engine/score';
import { deleteRecord, newId, pointsForMatch, saveRecord } from '../../storage/db';
import {
  SERVE_LOCATIONS,
  SERVE_RESULTS,
  SERVE_TYPES,
  type Match,
  type Point,
  type PointEnd,
  type Serve,
  type ServeLocation,
  type ServeResult,
  type ServeType,
  type Side,
} from '../../model/types';

interface Props {
  match: Match;
  nameA: string;
  nameB: string;
}

/** Point-by-point entry: serve outcome, then optional serve location and type. */
export default function MatchTracker({ match, nameA, nameB }: Props) {
  const points = useLiveQuery(() => pointsForMatch(match.id), [match.id]);
  // Serves already hit in the current point (a 1st-serve fault, or the serve that went in).
  const [draft, setDraft] = useState<Serve[]>([]);
  const [rally, setRally] = useState(false);
  const [result, setResult] = useState<ServeResult | null>(null);
  const [location, setLocation] = useState<ServeLocation>('none');
  const [type, setType] = useState<ServeType>('none');
  const [busy, setBusy] = useState(false);

  if (!points) return null;

  const firstServer = match.firstServer ?? 'A';
  const winners = points.map((p) => p.winner);
  const score = computeScore(match.rules, firstServer, winners);
  const server = score.server;
  const receiver = other(server);
  const serveNo = draft.length + 1;
  const name = (s: Side) => (s === 'A' ? nameA : nameB);

  function resetServe() {
    setResult(null);
    setLocation('none');
    setType('none');
  }

  async function recordPoint(serves: Serve[], end: PointEnd, winner: Side) {
    setBusy(true);
    try {
      const now = Date.now();
      await saveRecord<Point>('points', {
        id: newId(),
        matchId: match.id,
        seq: points!.length,
        server,
        winner,
        serves,
        end,
        createdAt: now,
        updatedAt: now,
      });
      if (computeScore(match.rules, firstServer, [...winners, winner]).winner) {
        await saveRecord<Match>('matches', { ...match, status: 'completed', finishedAt: now });
      }
      setDraft([]);
      setRally(false);
      resetServe();
    } finally {
      setBusy(false);
    }
  }

  async function commit(r: ServeResult, loc: ServeLocation, t: ServeType) {
    const serves = [...draft, { result: r, location: loc, type: t }];
    switch (r) {
      case 'ace':
        return recordPoint(serves, 'ace', server);
      case 'return_error':
        return recordPoint(serves, 'return_error', server);
      case 'return_winner':
        return recordPoint(serves, 'return_winner', receiver);
      case 'fault':
        if (serveNo === 2) return recordPoint(serves, 'double_fault', receiver);
        setDraft(serves);
        resetServe();
        return;
      case 'in':
        setDraft(serves);
        setRally(true);
        resetServe();
        return;
    }
  }

  function pickType(t: ServeType) {
    setType(t);
    // Type is the last row, so with an outcome chosen it completes the serve.
    if (result) void commit(result, location, t);
  }

  async function undo() {
    if (rally) {
      setRally(false);
      setDraft(draft.slice(0, -1));
      resetServe();
      return;
    }
    if (result || location !== 'none' || type !== 'none') return resetServe();
    if (draft.length) {
      setDraft([]);
      return;
    }
    const last = points!.at(-1);
    if (!last) return;
    setBusy(true);
    try {
      await deleteRecord('points', last.id);
      if (match.status === 'completed') {
        await saveRecord<Match>('matches', { ...match, status: 'in_progress', finishedAt: undefined });
      }
    } finally {
      setBusy(false);
    }
  }

  const canUndo = rally || draft.length > 0 || result !== null || location !== 'none' || type !== 'none' || points.length > 0;

  return (
    <div className="tracker">
      {score.winner ? (
        <div className="match-over">
          <strong>{name(score.winner)}</strong> wins the match
        </div>
      ) : (
        <>
          <div className="serve-status">
            <span>
              <strong>{name(server)}</strong> serving
            </span>
            <span className={`serve-no ${serveNo === 2 ? 'second' : ''}`}>{serveNo === 1 ? '1st serve' : '2nd serve'}</span>
            <span className="muted">
              {score.side === 'deuce' ? 'Deuce court' : 'Ad court'}
              {score.isMatchTiebreak ? ' · Match tiebreak' : score.inTiebreak ? ' · Tiebreak' : ''}
            </span>
          </div>

          {rally ? (
            <section>
              <h2>Serve in - who won the point?</h2>
              <div className="choice-grid two">
                {(['A', 'B'] as const).map((s) => (
                  <button key={s} type="button" className="btn btn-big" disabled={busy} onClick={() => void recordPoint(draft, 'rally', s)}>
                    {name(s)}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="serve-entry">
              <h2>Outcome</h2>
              <div className="choice-grid outcomes">
                {SERVE_RESULTS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`btn ${result === r.value ? 'btn-primary' : ''} ${r.value === 'fault' ? 'fault' : ''}`}
                    aria-pressed={result === r.value}
                    disabled={busy}
                    onClick={() => setResult(r.value)}
                  >
                    {r.value === 'fault' && serveNo === 2 ? 'Fault (double)' : r.label}
                  </button>
                ))}
              </div>

              <h2>Location</h2>
              <div className="choice-grid three">
                {SERVE_LOCATIONS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    className={`btn ${location === l.value ? 'btn-primary' : ''}`}
                    aria-pressed={location === l.value}
                    disabled={busy}
                    onClick={() => setLocation(location === l.value ? 'none' : l.value)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <h2>Type</h2>
              <div className="choice-grid three">
                {SERVE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`btn ${type === t.value ? 'btn-primary' : ''}`}
                    aria-pressed={type === t.value}
                    disabled={busy}
                    onClick={() => pickType(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-primary btn-big next-btn"
                disabled={!result || busy}
                onClick={() => result && void commit(result, location, type)}
              >
                Next
              </button>
            </section>
          )}
        </>
      )}

      <button type="button" className="btn undo-btn" disabled={!canUndo || busy} onClick={() => void undo()}>
        Undo
      </button>

      <ScoreTable score={score} noAd={match.rules.noAd} nameA={nameA} nameB={nameB} />
      <p className="muted point-count">Points played: {points.length}</p>
    </div>
  );
}
