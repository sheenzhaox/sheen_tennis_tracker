import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ScoreTable from '../components/ScoreTable';
import { computeScore, other } from '../../engine/score';
import { deleteRecord, newId, pointsForMatch, saveRecord } from '../../storage/db';
import {
  RETURN_DIRECTIONS,
  RETURN_ERRORS,
  RETURN_STROKES,
  SERVE_LOCATIONS,
  SERVE_RESULTS,
  SERVE_TYPES,
  type Match,
  type Point,
  type PointEnd,
  type ReturnDirection,
  type ReturnError,
  type ReturnStroke,
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

interface Selection {
  result: ServeResult | null;
  stroke: ReturnStroke;
  direction: ReturnDirection;
  error: ReturnError;
  location: ServeLocation;
  type: ServeType;
}

const EMPTY: Selection = { result: null, stroke: 'none', direction: 'none', error: 'none', location: 'none', type: 'none' };

const isReturn = (r: ServeResult | null) => r === 'return_winner' || r === 'return_error';

function toServe(s: Selection & { result: ServeResult }): Serve {
  const serve: Serve = { result: s.result, location: s.location, type: s.type };
  if (s.result === 'return_winner') serve.return = { stroke: s.stroke, direction: s.direction };
  if (s.result === 'return_error') serve.return = { stroke: s.stroke, direction: s.direction, error: s.error };
  return serve;
}

/** Point-by-point entry: serve outcome, optional return detail, then optional serve location and type. */
export default function MatchTracker({ match, nameA, nameB }: Props) {
  const points = useLiveQuery(() => pointsForMatch(match.id), [match.id]);
  // Serves already hit in the current point (a 1st-serve fault, or the serve that went in).
  const [draft, setDraft] = useState<Serve[]>([]);
  const [rally, setRally] = useState(false);
  const [sel, setSel] = useState<Selection>(EMPTY);
  const [busy, setBusy] = useState(false);

  if (!points) return null;

  const firstServer = match.firstServer ?? 'A';
  const winners = points.map((p) => p.winner);
  const score = computeScore(match.rules, firstServer, winners);
  const server = score.server;
  const receiver = other(server);
  const serveNo = draft.length + 1;
  const name = (s: Side) => (s === 'A' ? nameA : nameB);
  const hasSelection = JSON.stringify(sel) !== JSON.stringify(EMPTY);

  const resetServe = () => setSel(EMPTY);
  const pick = <K extends keyof Selection>(key: K, value: Selection[K]) =>
    setSel((s) => ({ ...s, [key]: s[key] === value && key !== 'result' ? 'none' : value }));

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

  async function commit(s: Selection) {
    if (!s.result) return;
    const r = s.result;
    const serves = [...draft, toServe({ ...s, result: r })];
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

  function pickType(t: Exclude<ServeType, 'none'>) {
    const next = { ...sel, type: sel.type === t ? ('none' as const) : t };
    setSel(next);
    // Type is the last row, so with an outcome chosen it completes the serve.
    if (next.result && next.type !== 'none') void commit(next);
  }

  async function undo() {
    if (rally) {
      setRally(false);
      setDraft(draft.slice(0, -1));
      resetServe();
      return;
    }
    if (hasSelection) return resetServe();
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

  const canUndo = rally || draft.length > 0 || hasSelection || points.length > 0;

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
                    className={`btn ${sel.result === r.value ? 'btn-primary' : ''} ${r.value === 'fault' ? 'fault' : ''}`}
                    aria-pressed={sel.result === r.value}
                    disabled={busy}
                    onClick={() => pick('result', r.value)}
                  >
                    {r.value === 'fault' && serveNo === 2 ? 'Fault (double)' : r.label}
                  </button>
                ))}
              </div>

              {isReturn(sel.result) && (
                <>
                  <OptionRow title="Return" options={RETURN_STROKES} value={sel.stroke} cols="two" disabled={busy} onPick={(v) => pick('stroke', v)} />
                  <OptionRow title="Return direction" options={RETURN_DIRECTIONS} value={sel.direction} disabled={busy} onPick={(v) => pick('direction', v)} />
                  {sel.result === 'return_error' && (
                    <OptionRow title="Return error" options={RETURN_ERRORS} value={sel.error} disabled={busy} onPick={(v) => pick('error', v)} />
                  )}
                </>
              )}

              <OptionRow title="Serve location" options={SERVE_LOCATIONS} value={sel.location} disabled={busy} onPick={(v) => pick('location', v)} />
              <OptionRow title="Serve type" options={SERVE_TYPES} value={sel.type} disabled={busy} onPick={pickType} />

              <button
                type="button"
                className="btn btn-primary btn-big next-btn"
                disabled={!sel.result || busy}
                onClick={() => void commit(sel)}
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

interface RowProps<T extends string> {
  title: string;
  options: { value: T; label: string }[];
  value: string;
  cols?: 'two' | 'three';
  disabled: boolean;
  onPick: (value: T) => void;
}

function OptionRow<T extends string>({ title, options, value, cols = 'three', disabled, onPick }: RowProps<T>) {
  return (
    <>
      <h2>{title}</h2>
      <div className={`choice-grid ${cols}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`btn ${value === o.value ? 'btn-primary' : ''}`}
            aria-pressed={value === o.value}
            disabled={disabled}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}
