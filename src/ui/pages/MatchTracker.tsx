import { useState } from 'react';
import { usePendingCount, useSyncState } from '../hooks';
import type { SyncState } from '../../storage/sync';
import { useLiveQuery } from 'dexie-react-hooks';
import ScoreTable from '../components/ScoreTable';
import OptionRow from '../components/OptionRow';
import RallyEntry from '../components/RallyEntry';
import { shortName } from '../format';
import { computeScore, other } from '../../engine/score';
import { deleteRecord, newId, pointsForMatch, saveRecord } from '../../storage/db';
import {
  RETURN_DIRECTIONS,
  RETURN_ERRORS,
  RETURN_STROKES,
  SERVE_LOCATIONS,
  SERVE_RESULTS,
  SERVE_TYPES,
  rallyWonByServer,
  type Match,
  type Point,
  type PointEnd,
  type RallyDetail,
  type ReturnDirection,
  type ReturnError,
  type ReturnStroke,
  type Serve,
  type ServeLocation,
  type ServeResult,
  type ServeType,
  type Side,
} from '../../model/types';

function shortSync(s: SyncState, pending: number): string {
  switch (s.status) {
    case 'signed-out':
      return 'Signed out';
    case 'offline':
      return `Offline · ${pending} pending`;
    case 'syncing':
      return 'Syncing...';
    case 'error':
      return `Sync error · ${pending} pending`;
    default:
      return pending ? `${pending} pending` : '✓ Synced';
  }
}

function syncTone(s: SyncState, pending: number): 'ok' | 'warn' | 'bad' {
  if (s.status === 'error' || s.status === 'signed-out') return 'bad';
  if (s.status === 'offline' || pending > 0) return 'warn';
  return 'ok';
}

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
  fault: ReturnError;
}

const EMPTY: Selection = {
  result: null,
  stroke: 'none',
  direction: 'none',
  error: 'none',
  location: 'none',
  type: 'none',
  fault: 'none',
};

const isReturn = (r: ServeResult | null) => r === 'return_winner' || r === 'return_error';

function toServe(s: Selection & { result: ServeResult }): Serve {
  const serve: Serve = { result: s.result, location: s.location, type: s.type };
  if (s.result === 'fault') serve.fault = s.fault;
  if (s.result === 'return_winner') serve.return = { stroke: s.stroke, direction: s.direction };
  if (s.result === 'return_error') serve.return = { stroke: s.stroke, direction: s.direction, error: s.error };
  return serve;
}

/** Point-by-point entry: serve outcome, optional serve location and type, then optional return detail. */
export default function MatchTracker({ match, nameA, nameB }: Props) {
  const points = useLiveQuery(() => pointsForMatch(match.id), [match.id]);
  // Serves already hit in the current point (a 1st-serve fault, or the serve that went in).
  const [draft, setDraft] = useState<Serve[]>([]);
  const [rally, setRally] = useState(false);
  const [sel, setSel] = useState<Selection>(EMPTY);
  const sync = useSyncState();
  const pending = usePendingCount();
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

  async function recordPoint(serves: Serve[], end: PointEnd, winner: Side, rallyDetail?: RallyDetail) {
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
        rally: rallyDetail,
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

  /** Adds a missed point with no details. */
  async function addUnrecorded(winner: Side) {
    setBusy(true);
    try {
      const now = Date.now();
      await saveRecord<Point>('points', {
        id: newId(),
        matchId: match.id,
        seq: winners.length,
        server,
        winner,
        serves: [],
        end: 'unrecorded',
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

  // Picking a value in the last visible row completes the serve (if an outcome is chosen).
  const lastRow: keyof Selection =
    sel.result === 'return_error' ? 'error' : sel.result === 'return_winner' ? 'direction' : 'type';

  function pickRow<K extends Exclude<keyof Selection, 'result'>>(key: K, value: Selection[K]) {
    const next = { ...sel, [key]: sel[key] === value ? 'none' : value };
    setSel(next);
    if (key === lastRow && next.result && next[key] !== 'none') void commit(next);
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
              <strong>{shortName(name(server))}</strong> serving
            </span>
            <span className={`serve-no ${serveNo === 2 && !rally ? 'second' : ''}`}>
              {rally ? 'Rally' : serveNo === 1 ? '1st serve' : '2nd serve'}
            </span>
            <span className="muted">
              {score.side === 'deuce' ? 'Deuce' : 'Ad'}
              {score.isMatchTiebreak ? ' · MTB' : score.inTiebreak ? ' · TB' : ''}
            </span>
          </div>

          {rally ? (
            <RallyEntry
              serverName={name(server)}
              returnerName={name(receiver)}
              busy={busy}
              onComplete={(r) => void recordPoint(draft, 'rally', rallyWonByServer(r.ending) ? server : receiver, r)}
            />
          ) : (
            <section className="serve-entry">
              <h2>Outcome</h2>
              <div className="choice-grid outcomes">
                {SERVE_RESULTS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`btn ${sel.result === r.value ? 'btn-primary' : ''} ${r.value === 'fault' || r.value === 'ace' ? r.value : ''}`}
                    aria-pressed={sel.result === r.value}
                    disabled={busy}
                    onClick={() => setSel({ ...sel, result: r.value })}
                  >
                    {r.value === 'fault' && serveNo === 2 ? 'Fault (double)' : r.label}
                  </button>
                ))}
              </div>

              <OptionRow title="Serve location" options={SERVE_LOCATIONS} value={sel.location} disabled={busy} onPick={(v) => pickRow('location', v)} />
              {sel.result === 'fault' && (
                <OptionRow title="Fault type" options={RETURN_ERRORS} value={sel.fault} disabled={busy} onPick={(v) => pickRow('fault', v)} />
              )}
              <OptionRow title="Serve type" options={SERVE_TYPES} value={sel.type} disabled={busy} onPick={(v) => pickRow('type', v)} />

              {isReturn(sel.result) && (
                <>
                  <OptionRow title="Return" options={RETURN_STROKES} value={sel.stroke} cols="two" disabled={busy} onPick={(v) => pickRow('stroke', v)} />
                  <OptionRow title="Return direction" options={RETURN_DIRECTIONS} value={sel.direction} disabled={busy} onPick={(v) => pickRow('direction', v)} />
                  {sel.result === 'return_error' && (
                    <OptionRow title="Return error" options={RETURN_ERRORS} value={sel.error} disabled={busy} onPick={(v) => pickRow('error', v)} />
                  )}
                </>
              )}

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

      <div className="score-dock">
        <ScoreTable
          score={score}
          noAd={match.rules.noAd}
          nameA={nameA}
          nameB={nameB}
          addDisabled={busy}
          onAddPoint={(s) => void addUnrecorded(s)}
        />
        <div className="dock-footer">
          <a className={`sync-badge ${syncTone(sync, pending)}`} href="#/settings">
            {shortSync(sync, pending)}
          </a>
          <span className="muted point-count">Points: {points.length}</span>
        </div>
      </div>
    </div>
  );
}
