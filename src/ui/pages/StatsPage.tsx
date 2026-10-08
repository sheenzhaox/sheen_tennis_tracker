import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import StatsShare from '../components/StatsShare';
import { finalisationLabel } from '../../model/match';
import { db, isLive, pointsForMatch } from '../../storage/db';
import { useAllPlayers, usePlayerNames } from '../hooks';
import { canShareStats, useUser } from '../user';
import {
  errorTypeStats,
  filterSets,
  isLuckyBall,
  pointContexts,
  rallyWinnerStats,
  serveLocationStats,
  setOptions,
  shotTypeStats,
  strokeStats,
  summary,
  type GameFilter,
  type PositionFilter,
  type SetOption,
  type SideFilter,
  type SituationFilter,
  type StrokeFilter,
  type PointContext,
} from '../../stats/matchStats';
import { RECORDED_SHOT_TYPES, SERVE_LOCATIONS, SHOT_DIRECTIONS, SHOT_POSITIONS, type PublicStats, type Side } from '../../model/types';

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

/** Chips where tapping the selected one clears it back to 'all'. */
function ToggleChips<T extends string>({ value, options, onChange }: { value: T | 'all'; options: { value: T; label: string }[]; onChange: (v: T | 'all') => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? 'on' : ''}`} onClick={() => onChange(value === o.value ? 'all' : o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="stats-table-scroll" tabIndex={0} role="region" aria-label="Statistics table">
      <table className="stats-table">
        <thead>
          <tr>
            {head.map((heading, index) => <th key={index}>{heading}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, columnIndex) => columnIndex === 0
                ? <th key={columnIndex}>{cell}</th>
                : <td key={columnIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Multi-select set switches; none selected = all sets. */
function SetChips({ options, value, onChange }: { options: SetOption[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o.index);
        return (
          <button
            key={o.index}
            type="button"
            className={`chip ${on ? 'on' : ''}`}
            onClick={() => onChange(on ? value.filter((i) => i !== o.index) : [...value, o.index])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type Section = 'summary' | 'serve' | 'stroke' | 'winners' | 'shots' | 'errors';

export default function StatsPage({ id }: { id: string }) {
  const user = useUser();
  const match = useLiveQuery(async () => {
    const m = await db.matches.get(id);
    return isLive(m) ? m : null;
  }, [id]);
  const points = useLiveQuery(() => pointsForMatch(id), [id]);
  const names = usePlayerNames();
  const players = useAllPlayers() ?? [];
  if (match === undefined || points === undefined) return null;
  if (match === null) {
    return (
      <>
        <Header title="Stats" back="/match" />
        <main className="page"><p>Match not found.</p></main>
      </>
    );
  }
  return <StatsView
    match={match} points={points}
    nameA={names.get(match.playerAId) ?? 'Player A'} nameB={names.get(match.playerBId) ?? 'Player B'}
    back={`/match/${id}`} sharing={canShareStats(user, match, players) ? <StatsShare key={id} matchId={id} /> : undefined}
  />;
}

export function StatsView({ match, points, nameA: a, nameB: b, back = '/', sharing, contexts, aggregate }: PublicStats & {
  back?: string; sharing?: ReactNode; contexts?: PointContext[]; aggregate?: string;
}) {
  const [server, setServer] = useState<Side>('A');
  const [side, setSide] = useState<SideFilter>('all');
  const [situation, setSituation] = useState<SituationFilter>('all');
  const [strokePlayer, setStrokePlayer] = useState<Side>('A');
  const [games, setGames] = useState<GameFilter>('all');
  const [winnerStroke, setWinnerStroke] = useState<'forehand' | 'backhand'>('forehand');
  const [ueStroke, setUeStroke] = useState<StrokeFilter>('all');
  const [uePosition, setUePosition] = useState<PositionFilter>('all');
  const [sets, setSets] = useState<Partial<Record<Section, number[]>>>({});

  const ctxs = contexts ?? pointContexts(match, points);
  const played = setOptions(ctxs);
  const sel = (s: Section) => sets[s] ?? [];
  const inSets = (s: Section) => filterSets(ctxs, sel(s));
  const setChips = (s: Section) => contexts ? null : <SetChips options={played} value={sel(s)} onChange={(v) => setSets({ ...sets, [s]: v })} />;
  const sum = summary(inSets('summary'));
  const loc = serveLocationStats(inSets('serve'), server, side, situation);
  const strokes = strokeStats(inSets('stroke'), strokePlayer, games);
  const rw = rallyWinnerStats(inSets('winners'), winnerStroke);
  const shots = shotTypeStats(inSets('shots'));
  const winnerShotTypes = RECORDED_SHOT_TYPES.filter((t) => t.value !== 'topspin' || rw.shotType.A.topspin + rw.shotType.B.topspin > 0);
  const shotTypes = RECORDED_SHOT_TYPES.filter((t) => t.value !== 'topspin'
    || shots.A.topspin.winners + shots.A.topspin.errors + shots.B.topspin.winners + shots.B.topspin.errors > 0);
  const errs = errorTypeStats(inSets('errors'), ueStroke, uePosition);
  const both = (f: (s: Side) => ReactNode): ReactNode[] => [f('A'), f('B')];
  const locLabel = (v: string) => SERVE_LOCATIONS.find((l) => l.value === v)?.label ?? 'Not set';

  return (
    <>
      <Header title={aggregate ? 'Player stats' : 'Stats'} back={back} />
      <main className="page stats">
        <p className="muted">
          {aggregate ? `${a} · ${aggregate}` : `${a} vs ${b}`} · {points.length} points
          {points.some((p) => p.end === 'unrecorded') ? ' (manual points excluded from details)' : ''}
          {!contexts && played.length > 0 ? '. Set buttons: none selected = all sets.' : ''}
        </p>
        {!contexts && match.finalisation && <p>{finalisationLabel(match, a, b)}</p>}
        {aggregate && <p className="muted">Combined recorded-point statistics from matches visible to your account. Each match uses its own scoring rules; scheduled and partial matches are included in the match count.</p>}
        {points.some(isLuckyBall) && <p className="muted small">
          Lucky ball points count only in total Winners and are excluded from all other stats. The match score is unchanged.
        </p>}
        {sharing}

        <h2>Summary</h2>
        {setChips('summary')}
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
        {setChips('serve')}
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

        <h2>Forehand / backhand</h2>
        {setChips('stroke')}
        <Chips value={strokePlayer} onChange={setStrokePlayer} options={[{ value: 'A', label: a }, { value: 'B', label: b }]} />
        <div className="chips">
          {(['serve', 'return'] as const).map((g) => (
            <button key={g} type="button" className={`chip ${games === g ? 'on' : ''}`} onClick={() => setGames(games === g ? 'all' : g)}>
              {g === 'serve' ? 'Service games' : 'Return games'}
            </button>
          ))}
        </div>
        <Table
          head={['', 'Total', 'Forehand', 'Backhand']}
          rows={strokes.map((r) => [r.label, r.total, r.forehand ?? '-', r.backhand ?? '-'])}
        />
        <p className="muted small">
          Neither selected = all games. Shot count: ace / double fault = 1, return ace / return error = 2, rallies use the recorded
          rally count (rallies without a count only appear in totals). Winners include forced errors. Return rows use the return stroke.
        </p>

        <h2>Rally winners</h2>
        {setChips('winners')}
        <Chips
          value={winnerStroke}
          onChange={setWinnerStroke}
          options={[
            { value: 'forehand', label: 'Forehand' },
            { value: 'backhand', label: 'Backhand' },
          ]}
        />
        <Table head={['Shot direction', a, b]} rows={SHOT_DIRECTIONS.map((d) => [d.label, ...both((s) => rw.direction[s][d.value])])} />
        <Table head={['Shot type', a, b]} rows={winnerShotTypes.map((t) => [t.label, ...both((s) => rw.shotType[s][t.value])])} />
        <p className="muted small">Rally winners (incl. forced errors) hit with the chosen stroke. Direction not set counts as Middle; unspecified shot types appear as Not set. Historical shot types appear only when recorded in the selected data.</p>

        <h2>Shot type</h2>
        {setChips('shots')}
        <Table
          head={['', `${a} W`, `${a} UE`, `${b} W`, `${b} UE`]}
          rows={shotTypes.map((t) => [
            t.label,
            shots.A[t.value].winners,
            shots.A[t.value].errors,
            shots.B[t.value].winners,
            shots.B[t.value].errors,
          ])}
        />

        <h2>Unforced errors</h2>
        {setChips('errors')}
        <ToggleChips
          value={ueStroke}
          onChange={setUeStroke}
          options={[
            { value: 'forehand', label: 'Forehand' },
            { value: 'backhand', label: 'Backhand' },
          ]}
        />
        <ToggleChips value={uePosition} onChange={setUePosition} options={SHOT_POSITIONS} />
        <Table
          head={['Error type', a, b]}
          rows={(['net', 'long', 'wide', 'none'] as const).map((t) => [
            t === 'none' ? 'Not set' : t[0].toUpperCase() + t.slice(1),
            ...both((s) => errs[s][t]),
          ])}
        />
        <p className="muted small">
          No stroke selected = all unforced errors (incl. double faults and stroke not set). No position selected = all positions;
          position not set (and double faults / return errors) counts as Baseline.
        </p>
      </main>
    </>
  );
}
