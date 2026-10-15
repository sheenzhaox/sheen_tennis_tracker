import { useState, type ReactNode } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import StatsShare from '../components/StatsShare';
import { finalisationLabel } from '../../model/match';
import { db, isLive, pointsForMatch } from '../../storage/db';
import { useAllPlayers, usePlayerNames } from '../hooks';
import { canShareStats, useUser } from '../user';
import {
  errorDirectionStats,
  filterSets,
  isLuckyBall,
  pointContexts,
  rallyWinnerStats,
  servePerformance,
  setOptions,
  shotTypeStats,
  strokeStats,
  summary,
  type GameFilter,
  type KeyPoint,
  type PositionFilter,
  type ServeKind,
  type ServePerformance,
  type ServeSpot,
  type SetOption,
  type StrokeFilter,
  type PointContext,
} from '../../stats/matchStats';
import { RECORDED_SHOT_TYPES, SERVE_LOCATIONS, SERVE_TYPES, SHOT_DIRECTIONS, SHOT_POSITIONS, type PublicStats, type Side } from '../../model/types';

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const ratio = (n: number, d: number) => (d ? `${n}/${d} (${pct(n, d)})` : '-');
const pct1 = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '-');
const tone = (n: number) => (n > 0 ? 'stat-good' : n < 0 ? 'stat-bad' : 'stat-even');
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const KEY_POINTS: { value: KeyPoint; label: string }[] = [
  { value: 'first', label: 'First point' },
  { value: 'game', label: 'Game points' },
  { value: 'break', label: 'Break points' },
  { value: 'tiebreak', label: 'Tiebreak' },
];

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
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

/** At most one choice; tapping the selected chip clears it (none selected = all). */
export function OptionalChips<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
            onClick={() => onChange(on ? [] : [o.value])}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Serve performance in total and by the serve type of each point's last serve. */
export function ServePerformanceTable({ perf }: { perf: Record<ServeKind | 'all', ServePerformance> }) {
  const columns: (ServeKind | 'all')[] = ['all', ...SERVE_TYPES.map((t) => t.value)];
  const row = (label: string, className: string, key: keyof ServePerformance): ReactNode[] =>
    [<span className={className}>{label}</span>, ...columns.map((c) => `${perf[c][key]} (${pct1(perf[c][key], perf[c].points)})`)];
  return <>
    <Table
      head={['', 'Total', ...SERVE_TYPES.map((t) => t.label)]}
      rows={[
        [<strong>Service points</strong>, ...columns.map((c) => perf[c].points)],
        row('Serve winners', 'stat-good', 'serveWinners'),
        row('Serve + 1', 'stat-good', 'servePlusOne'),
        row('Win due to serve', 'stat-good', 'wonDueToServe'),
        row('UE during Serve advantage', 'stat-bad', 'ueInAdvantage'),
        row('Double faults', 'stat-bad', 'doubleFaults'),
        row('Lost due to serve', 'stat-bad', 'lostDueToServe'),
        ['Serve score', ...columns.map((c) => {
          const score = perf[c].wonDueToServe - perf[c].lostDueToServe;
          const per100 = perf[c].points ? `${signed(Math.round((score / perf[c].points) * 1000) / 10)} / 100` : '-';
          return <span className={tone(score)}>{signed(score)} ({per100})</span>;
        })],
      ]}
    />
    <p className="muted small">
      Points count under their last serve (2nd serve includes double faults); type columns use that serve's type, with an
      unrecorded type counted as Flat and an unrecorded location as Body. % = share of the column's service points. Rows overlap
      and must not be added up. Win due to serve = ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage
      point. Lost due to serve = double fault, return ace, or receiver winner / server UE in a Return advantage point. Serve score =
      Win - Lost due to serve, also per 100 service points.
    </p>
  </>;
}

export function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
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

export function SummaryStats({ contexts, nameA, nameB, playerOnly = false, showSets = true }: {
  contexts: PointContext[]; nameA: string; nameB: string; playerOnly?: boolean; showSets?: boolean;
}) {
  const [sets, setSets] = useState<number[]>([]);
  const sum = summary(filterSets(contexts, sets));
  const players: Side[] = playerOnly ? ['A'] : ['A', 'B'];
  const both = (value: (side: Side) => ReactNode) => players.map(value);
  return <>
    {showSets && <SetChips options={setOptions(contexts)} value={sets} onChange={setSets} />}
    <Table head={['', ...players.map((side) => side === 'A' ? nameA : nameB)]} rows={[
      ['Points won', ...both((side) => sum[side].pointsWon)],
      ['Winners', ...both((side) => <strong>{sum[side].winners.total}</strong>)],
      ['- Aces', ...both((side) => sum[side].winners.aces)],
      ['- Return aces', ...both((side) => sum[side].winners.returnWinners)],
      ['- Rally winners', ...both((side) => sum[side].winners.rallyWinners)],
      ['Unforced errors', ...both((side) => <strong>{sum[side].errors.total}</strong>)],
      ['- Double faults', ...both((side) => sum[side].errors.doubleFaults)],
      ['- Return errors', ...both((side) => sum[side].errors.returnErrors)],
      ['- Rally errors', ...both((side) => sum[side].errors.rallyErrors)],
      ['1st serve in', ...both((side) => ratio(sum[side].firstServe.in, sum[side].firstServe.served))],
      ['1st serve pts won', ...both((side) => ratio(sum[side].firstServe.won, sum[side].firstServe.in))],
      ['2nd serve pts won', ...both((side) => ratio(sum[side].secondServe.won, sum[side].secondServe.served))],
    ]} />
  </>;
}

type Section = 'serve' | 'stroke' | 'winners' | 'shots' | 'errors';

export default function StatsPage({ id, returnTo }: { id: string; returnTo?: string | null }) {
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
        <Header title="Stats" back={returnTo ?? '/match'} />
        <main className="page"><p>Match not found.</p></main>
      </>
    );
  }
  return <StatsView
    match={match} points={points}
    nameA={names.get(match.playerAId) ?? 'Player A'} nameB={names.get(match.playerBId) ?? 'Player B'}
    back={returnTo ?? `/match/${id}`} sharing={canShareStats(user, match, players) ? <StatsShare key={id} matchId={id} /> : undefined}
    footer={match.status === 'completed' ? <a className="btn advanced-analysis-link"
      href={`#/match/${encodeURIComponent(id)}/advanced-analysis${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''}`}>
      <ChartNoAxesCombined size={20} aria-hidden="true" /> Advanced Analysis
    </a> : undefined}
  />;
}

export function StatsView({ match, points, nameA: a, nameB: b, back = '/', sharing, controls, footer, contexts, aggregate, playerOnly = false }: PublicStats & {
  back?: string; sharing?: ReactNode; controls?: ReactNode; footer?: ReactNode; contexts?: PointContext[]; aggregate?: string; playerOnly?: boolean;
}) {
  const [server, setServer] = useState<Side>('A');
  const [serveSides, setServeSides] = useState<('deuce' | 'ad')[]>([]);
  const [attempts, setAttempts] = useState<number[]>([]);
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [locations, setLocations] = useState<ServeSpot[]>([]);
  const [strokePlayer, setStrokePlayer] = useState<Side>('A');
  const [games, setGames] = useState<GameFilter>('all');
  const [winnerStroke, setWinnerStroke] = useState<'forehand' | 'backhand'>('forehand');
  const [shotStroke, setShotStroke] = useState<StrokeFilter>('all');
  const [shotPlayer, setShotPlayer] = useState<Side>('A');
  const [uePlayer, setUePlayer] = useState<Side>('A');
  const [ueStroke, setUeStroke] = useState<StrokeFilter>('all');
  const [uePosition, setUePosition] = useState<PositionFilter>('all');
  const [sets, setSets] = useState<Partial<Record<Section, number[]>>>({});

  const ctxs = contexts ?? pointContexts(match, points);
  const played = setOptions(ctxs);
  const sel = (s: Section) => sets[s] ?? [];
  const inSets = (s: Section) => filterSets(ctxs, sel(s));
  const setChips = (s: Section) => contexts ? null : <SetChips options={played} value={sel(s)} onChange={(v) => setSets({ ...sets, [s]: v })} />;
  const perf = servePerformance(ctxs, {
    server: playerOnly ? 'A' : server, sets: contexts ? [] : sel('serve'), sides: serveSides, attempts, keyPoints, locations,
  });
  const strokes = strokeStats(inSets('stroke'), playerOnly ? 'A' : strokePlayer, games);
  const rw = rallyWinnerStats(inSets('winners'), winnerStroke);
  const shots = shotTypeStats(inSets('shots'), shotStroke);
  const shotSide = playerOnly ? 'A' : shotPlayer;
  const errorSide = playerOnly ? 'A' : uePlayer;
  const shotName = shotSide === 'A' ? a : b;
  const winnerShotTypes = RECORDED_SHOT_TYPES.filter((t) => t.value !== 'topspin' || rw.shotType.A.topspin + (playerOnly ? 0 : rw.shotType.B.topspin) > 0);
  const shotTypes = RECORDED_SHOT_TYPES.filter((t) => t.value !== 'topspin'
    || shots[shotSide].topspin.winners + shots[shotSide].topspin.errors > 0);
  const errs = errorDirectionStats(inSets('errors'), ueStroke, uePosition);
  const players: Side[] = playerOnly ? ['A'] : ['A', 'B'];
  const both = (f: (s: Side) => ReactNode): ReactNode[] => players.map(f);
  const playerNames = players.map((s) => s === 'A' ? a : b);

  return (
    <>
      <Header title={aggregate ? 'Player stats' : 'Stats'} back={back} />
      <main className="page stats">
        {controls}
        <p className="muted">
          {aggregate ? `${a} · ${aggregate}` : `${a} vs ${b}`} · {points.length} points
          {points.some((p) => p.end === 'unrecorded') ? ' (manual points excluded from details)' : ''}
          {!contexts && played.length > 0 ? '. Set buttons: none selected = all sets.' : ''}
        </p>
        {!contexts && match.finalisation && <p>{finalisationLabel(match, a, b)}</p>}
        {aggregate && <p className="muted">Combined recorded-point statistics from selected completed matches visible to your account. Each match uses its own scoring rules.</p>}
        {points.some(isLuckyBall) && <p className="muted small">
          Lucky ball points count only in total Winners and are excluded from all other stats. The match score is unchanged.
        </p>}
        {sharing}

        <h2>Summary</h2>
        <SummaryStats contexts={ctxs} nameA={a} nameB={b} playerOnly={playerOnly} showSets={!contexts} />

        <h2>Serve performance</h2>
        {setChips('serve')}
        {!playerOnly && <Chips value={server} onChange={setServer} options={[{ value: 'A', label: a }, { value: 'B', label: b }]} />}
        <OptionalChips label="Court side" options={[{ value: 'deuce', label: 'Deuce' }, { value: 'ad', label: 'Ad' }]} value={serveSides} onChange={setServeSides} />
        <OptionalChips label="Serve attempt" options={[{ value: 1, label: '1st serve' }, { value: 2, label: '2nd serve' }]} value={attempts} onChange={setAttempts} />
        <OptionalChips label="Key points" options={KEY_POINTS} value={keyPoints} onChange={setKeyPoints} />
        <OptionalChips label="Serve location" options={SERVE_LOCATIONS} value={locations} onChange={setLocations} />
        <p className="muted small">Side, serve, key point and location: pick one or none; none selected = all.</p>
        <ServePerformanceTable perf={perf} />

        <h2>Forehand / backhand</h2>
        {setChips('stroke')}
        {!playerOnly && <Chips value={strokePlayer} onChange={setStrokePlayer} options={[{ value: 'A', label: a }, { value: 'B', label: b }]} />}
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
          Neither selected = all games. Aces, double faults, return aces and return errors are serve-phase points. Rallies use the
          recorded Serve Impact State; older rally counts map to it (3 + server winner = Serve +1, 3-6 = advantage/disadvantage by
          ending player, 7+ = Neutralised). Rallies without either only appear in totals. Winners include forced errors. Return rows
          use the return stroke. Serve advantage = ace, return error, Serve +1, or server winner / receiver UE in a Serve advantage
          point; Serve disadvantage = double fault, return ace, or receiver winner / server UE in a Return advantage point; Return
          advantage = the same without double faults. Their
          Forehand / Backhand show only the shots of the player who gained.
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
        <Table head={['Shot direction', ...playerNames]} rows={SHOT_DIRECTIONS.map((d) => [d.label, ...both((s) => rw.direction[s][d.value])])} />
        <Table head={['Shot type', ...playerNames]} rows={winnerShotTypes.map((t) => [t.label, ...both((s) => rw.shotType[s][t.value])])} />
        <p className="muted small">Rally winners (incl. forced errors) hit with the chosen stroke. Direction not set counts as Middle; unspecified shot types appear as Not set. Historical shot types appear only when recorded in the selected data.</p>

        <h2>Shot type</h2>
        {!playerOnly && <Chips value={shotPlayer} onChange={setShotPlayer} options={[{ value: 'A', label: a }, { value: 'B', label: b }]} />}
        {setChips('shots')}
        <ToggleChips
          value={shotStroke}
          onChange={setShotStroke}
          options={[
            { value: 'forehand', label: 'Forehand' },
            { value: 'backhand', label: 'Backhand' },
          ]}
        />
        <Table
          head={['', `${shotName} W`, `${shotName} UE`]}
          rows={shotTypes.map((t) => [
            t.label,
            shots[shotSide][t.value].winners, shots[shotSide][t.value].errors,
          ])}
        />

        <p className="muted small">No stroke selected = both forehand and backhand, including shots with stroke not set.</p>

        <h2>Unforced errors</h2>
        {!playerOnly && <Chips value={uePlayer} onChange={setUePlayer} options={[{ value: 'A', label: a }, { value: 'B', label: b }]} />}
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
        <section aria-label={`${errorSide === 'A' ? a : b} unforced errors`}>
          <Table
            head={['Shot direction', 'Net', 'Long', 'Wide', 'Total']}
            rows={[...SHOT_DIRECTIONS, { value: 'none' as const, label: 'Not set' }].map((d) => [
              d.label, errs[errorSide][d.value].net, errs[errorSide][d.value].long, errs[errorSide][d.value].wide, errs[errorSide][d.value].total,
            ])}
          />
        </section>
        <p className="muted small">
          No stroke selected = all unforced errors (incl. double faults and stroke not set). No position selected = all positions;
          position not set (and double faults / return errors) counts as Baseline.
          {' '}Missing directions appear as Not set. Total includes errors with an unrecorded error type.
        </p>
        {footer}
      </main>
    </>
  );
}
