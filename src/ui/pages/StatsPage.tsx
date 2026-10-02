import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, isLive, pointsForMatch } from '../../storage/db';
import { usePlayerNames } from '../hooks';
import {
  errorBreakdown,
  pointContexts,
  rallyStrokeStats,
  serveLocationStats,
  shotTypeStats,
  summary,
  type RallyLengthFilter,
  type SideFilter,
  type SituationFilter,
} from '../../stats/matchStats';
import { SERVE_LOCATIONS, SHOT_POSITIONS, SHOT_TYPES, type Side } from '../../model/types';

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const ratio = (n: number, d: number) => (d ? `${n}/${d} (${pct(n, d)})` : '-');

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <table className="stats-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StatsPage({ id }: { id: string }) {
  const match = useLiveQuery(async () => {
    const m = await db.matches.get(id);
    return isLive(m) ? m : null;
  }, [id]);
  const points = useLiveQuery(() => pointsForMatch(id), [id]);
  const names = usePlayerNames();
  const [server, setServer] = useState<Side>('A');
  const [side, setSide] = useState<SideFilter>('all');
  const [situation, setSituation] = useState<SituationFilter>('all');
  const [length, setLength] = useState<RallyLengthFilter>('all');

  if (match === undefined || points === undefined) return null;
  if (match === null) {
    return (
      <>
        <Header title="Stats" back="/match" />
        <main className="page">
          <p>Match not found.</p>
        </main>
      </>
    );
  }

  const a = names.get(match.playerAId) ?? 'Player A';
  const b = names.get(match.playerBId) ?? 'Player B';
  const ctxs = pointContexts(match, points);
  const sum = summary(ctxs);
  const loc = serveLocationStats(ctxs, server, side, situation);
  const strokes = rallyStrokeStats(ctxs, length);
  const shots = shotTypeStats(ctxs);
  const errs = errorBreakdown(ctxs);
  const both = (f: (s: Side) => ReactNode): ReactNode[] => [f('A'), f('B')];
  const locLabel = (v: string) => SERVE_LOCATIONS.find((l) => l.value === v)?.label ?? 'Not set';

  return (
    <>
      <Header title="Stats" back={`/match/${id}`} />
      <main className="page stats">
        <p className="muted">
          {a} vs {b} · {points.length} points
          {points.some((p) => p.end === 'unrecorded') ? ' (manual points excluded from details)' : ''}
        </p>

        <h2>Summary</h2>
        <Table
          head={['', a, b]}
          rows={[
            ['Points won', ...both((s) => sum[s].pointsWon)],
            ['Winners', ...both((s) => <strong>{sum[s].winners.total}</strong>)],
            ['- Aces', ...both((s) => sum[s].winners.aces)],
            ['- Return aces', ...both((s) => sum[s].winners.returnWinners)],
            ['- Rally winners', ...both((s) => sum[s].winners.rallyWinners)],
            ['Unforced errors', ...both((s) => <strong>{sum[s].errors.total}</strong>)],
            ['- Double faults', ...both((s) => sum[s].errors.doubleFaults)],
            ['- Return errors', ...both((s) => sum[s].errors.returnErrors)],
            ['- Rally errors', ...both((s) => sum[s].errors.rallyErrors)],
            ['1st serve in', ...both((s) => ratio(sum[s].firstServe.in, sum[s].firstServe.served))],
            ['1st serve pts won', ...both((s) => ratio(sum[s].firstServe.won, sum[s].firstServe.in))],
            ['2nd serve pts won', ...both((s) => ratio(sum[s].secondServe.won, sum[s].secondServe.served))],
          ]}
        />

        <h2>Serve location</h2>
        <Chips value={server} onChange={setServer} options={[{ value: 'A', label: a }, { value: 'B', label: b }]} />
        <Chips
          value={side}
          onChange={setSide}
          options={[
            { value: 'all', label: 'All sides' },
            { value: 'deuce', label: 'Deuce' },
            { value: 'ad', label: 'Ad' },
          ]}
        />
        <Chips
          value={situation}
          onChange={setSituation}
          options={[
            { value: 'all', label: 'All points' },
            { value: 'first', label: 'First point' },
            { value: 'game', label: 'Game point' },
            { value: 'break', label: 'Break point' },
          ]}
        />
        <Table
          head={['', '1st: in', '1st: won', '2nd: in', '2nd: won']}
          rows={(['wide', 'body', 't', 'none'] as const).map((l) => [
            locLabel(l),
            ratio(loc[l].first.in, loc[l].first.count),
            ratio(loc[l].first.won, loc[l].first.in),
            ratio(loc[l].second.in, loc[l].second.count),
            ratio(loc[l].second.won, loc[l].second.in),
          ])}
        />
        <p className="muted small">
          "in" = serves in / serves hit at that location; "won" = points won / serves in.
        </p>

        <h2>Rally: forehand / backhand</h2>
        <Chips
          value={length}
          onChange={setLength}
          options={[
            { value: 'all', label: 'All rallies' },
            { value: 'odd', label: '1-3-5' },
            { value: 'even', label: '2-4-6' },
            { value: 'long', label: '7+ shots' },
          ]}
        />
        <Table
          head={['', `${a} W`, `${a} UE`, `${b} W`, `${b} UE`]}
          rows={(['forehand', 'backhand', 'none'] as const).map((k) => [
            k === 'none' ? 'Not set' : k === 'forehand' ? 'Forehand' : 'Backhand',
            strokes.A[k].winners,
            strokes.A[k].errors,
            strokes.B[k].winners,
            strokes.B[k].errors,
          ])}
        />
        <p className="muted small">
          W = winner & forced error, UE = unforced error (last shot of the rally). 1-3-5 = rallies of 1, 3 or 5 shots (ended on the
          server's shot); 2-4-6 = 2, 4 or 6 shots (ended on the returner's shot); 7+ = either.
        </p>

        <h2>Shot type</h2>
        <Table
          head={['', `${a} W`, `${a} UE`, `${b} W`, `${b} UE`]}
          rows={[...SHOT_TYPES, { value: 'none' as const, label: 'Not set' }].map((t) => [
            t.label,
            shots.A[t.value].winners,
            shots.A[t.value].errors,
            shots.B[t.value].winners,
            shots.B[t.value].errors,
          ])}
        />

        <h2>Unforced errors</h2>
        <Table
          head={['', a, b]}
          rows={[
            ['Forehand', ...both((s) => errs[s].stroke.forehand)],
            ['Backhand', ...both((s) => errs[s].stroke.backhand)],
            ['Serve (DF)', ...both((s) => errs[s].stroke.serve)],
            ['Stroke not set', ...both((s) => errs[s].stroke.none)],
          ]}
        />
        <Table
          head={['Court position', a, b]}
          rows={[...SHOT_POSITIONS, { value: 'none' as const, label: 'Not set' }].map((pos) => [
            pos.label,
            ...both((s) => errs[s].position[pos.value]),
          ])}
        />
        <Table
          head={['Error type', a, b]}
          rows={(['net', 'long', 'wide', 'none'] as const).map((t) => [
            t === 'none' ? 'Not set' : t[0].toUpperCase() + t.slice(1),
            ...both((s) => errs[s].type[t]),
          ])}
        />
        <p className="muted small">Includes double faults (fault type of the 2nd serve), return errors and rally unforced errors.</p>
      </main>
    </>
  );
}
