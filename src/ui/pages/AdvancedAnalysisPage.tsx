import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, isLive, pointsForMatch } from '../../storage/db';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, surfaceLabel } from '../format';
import { describeRules } from '../../model/rules';
import { finalisationLabel } from '../../model/match';
import { SERVE_LOCATIONS, SERVE_TYPES, type Match, type Point, type Side } from '../../model/types';
import {
  breakPointsSaved,
  locationRepeats,
  pointContexts,
  serveDistribution,
  serveFaults,
  serveImpactStats,
  servePerformance,
  serviceGamesHeld,
  setOptions,
  type ImpactRow,
  type KeyPoint,
  type PointContext,
  type ServeFilters,
  type ServeKind,
  type ServeSpot,
} from '../../stats/matchStats';
import { KEY_POINTS, ServePerformanceTable, SummaryStats, Table } from './StatsPage';

export default function AdvancedAnalysisPage({ id, returnTo }: { id: string; returnTo?: string | null }) {
  const match = useLiveQuery(async () => {
    const record = await db.matches.get(id);
    return isLive(record) ? record : null;
  }, [id]);
  const points = useLiveQuery(() => pointsForMatch(id), [id]);
  const names = usePlayerNames();
  const back = `/match/${encodeURIComponent(id)}/stats${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''}`;
  const message = match === undefined ? 'Loading match...'
    : match === null ? 'Match not found.'
      : match.status !== 'completed' ? 'Advanced Analysis is available for completed matches only.'
        : points === undefined ? 'Loading points...' : null;
  if (message || !match || !points) return <>
    <Header title="Advanced Analysis" back={back} />
    <main className="page advanced-analysis"><p role="status">{message}</p></main>
  </>;
  return <AdvancedAnalysisView key={id} match={match} points={points}
    nameA={names.get(match.playerAId) ?? 'Player A'} nameB={names.get(match.playerBId) ?? 'Player B'} back={back} />;
}

export function AdvancedAnalysisView({ match, points, nameA, nameB, back }: {
  match: Match; points: Point[]; nameA: string; nameB: string; back: string;
}) {
  const ctxs = pointContexts(match, points);
  return <>
    <Header title="Advanced Analysis" back={back} />
    <main className="page stats advanced-analysis">
      <section aria-labelledby="analysis-match">
        <h2 id="analysis-match">Match Information</h2>
        <p className="analysis-players"><strong>{nameA} vs {nameB}</strong></p>
        <dl className="analysis-match-info">
          {formatMatchDay(match) && <><dt>Date</dt><dd>{formatMatchDay(match)}</dd></>}
          {match.venue && <><dt>Location</dt><dd>{match.venue}</dd></>}
          {match.event && <><dt>Event</dt><dd>{match.event}</dd></>}
          {match.round && <><dt>Round</dt><dd>{match.round}</dd></>}
          {surfaceLabel(match.surface) && <><dt>Surface</dt><dd>{surfaceLabel(match.surface)}</dd></>}
          <dt>Format</dt><dd>{match.ruleSetName}<br />{describeRules(match.rules)}</dd>
          {match.firstServer && <><dt>First server</dt><dd>{match.firstServer === 'A' ? nameA : nameB}</dd></>}
          {match.ownerName && <><dt>Recorded by</dt><dd>{match.ownerName}</dd></>}
          {match.notes && <><dt>Notes</dt><dd className="analysis-notes">{match.notes}</dd></>}
        </dl>
        {match.finalisation && <p>{finalisationLabel(match, nameA, nameB)}</p>}
      </section>
      <section aria-labelledby="analysis-general">
        <h2 id="analysis-general">General Statistics</h2>
        <SummaryStats contexts={ctxs} nameA={nameA} nameB={nameB} match={match} />
      </section>
      <section aria-labelledby="analysis-serve">
        <h2 id="analysis-serve">Serve Statistics</h2>
        <ServeStatistics match={match} ctxs={ctxs} nameA={nameA} nameB={nameB} />
      </section>
      <section aria-labelledby="analysis-return"><h2 id="analysis-return">Return Statistics</h2></section>
      <section aria-labelledby="analysis-winner"><h2 id="analysis-winner">Winner Statistics</h2></section>
      <section aria-labelledby="analysis-ue"><h2 id="analysis-ue">Unforced Error Statistics</h2></section>
      <section aria-labelledby="analysis-other"><h2 id="analysis-other">Other Key Factors Statistics</h2></section>
    </main>
  </>;
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '-');
const share = (n: number, d: number) => `${n} (${pct(n, d)})`;
const ratio = (n: number, d: number) => (d ? `${n}/${d} (${pct(n, d)})` : '-');

const LOCATION_ROWS = SERVE_LOCATIONS;
const TYPE_COLUMNS = SERVE_TYPES;

type All = 'all';
type FilterKey = 'side' | 'attempt' | 'point' | 'location';

/** Exactly one choice is always selected. */
function PickChips<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const only = <T,>(v: T | All): T[] => (v === 'all' ? [] : [v as T]);

/** One part's own Player / Set and optional extra selectors, each defaulting to Player A / All. */
function useServeFilters(ctxs: PointContext[], nameA: string, nameB: string, keys: FilterKey[]): [ServeFilters, ReactNode] {
  const [server, setServer] = useState<Side>('A');
  const [set, setSet] = useState<number | All>('all');
  const [side, setSide] = useState<'deuce' | 'ad' | All>('all');
  const [attempt, setAttempt] = useState<1 | 2 | All>('all');
  const [point, setPoint] = useState<KeyPoint | All>('all');
  const [location, setLocation] = useState<ServeSpot | All>('all');
  const sets = setOptions(ctxs).map((o) => ({ value: o.index as number | All, label: o.label }));
  const filters: ServeFilters = {
    server, sets: only(set), sides: only(side), attempts: only(attempt), keyPoints: only(point), locations: only(location),
  };
  const controls = <>
    <PickChips label="Player" value={server} onChange={setServer} options={[{ value: 'A', label: nameA }, { value: 'B', label: nameB }]} />
    {sets.length > 1 && <PickChips label="Set" value={set} onChange={setSet} options={[{ value: 'all', label: 'All sets' }, ...sets]} />}
    {sets.length === 1 && <PickChips label="Set" value={sets[0].value} onChange={() => {}} options={sets} />}
    {keys.includes('side') && <PickChips label="Court side" value={side} onChange={setSide}
      options={[{ value: 'all', label: 'All sides' }, { value: 'deuce', label: 'Deuce' }, { value: 'ad', label: 'Ad' }]} />}
    {keys.includes('attempt') && <PickChips label="Serve attempt" value={attempt} onChange={setAttempt}
      options={[{ value: 'all', label: 'All serves' }, { value: 1, label: '1st serve' }, { value: 2, label: '2nd serve' }]} />}
    {keys.includes('point') && <PickChips label="Key points" value={point} onChange={setPoint}
      options={[{ value: 'all', label: 'All points' }, ...KEY_POINTS]} />}
    {keys.includes('location') && <PickChips label="Serve location" value={location} onChange={setLocation}
      options={[{ value: 'all', label: 'All locations' }, ...SERVE_LOCATIONS]} />}
  </>;
  return [filters, controls];
}

type PartProps = { ctxs: PointContext[]; nameA: string; nameB: string };

export function ServeStatistics({ match, ctxs, nameA, nameB }: PartProps & { match: Match }) {
  const props = { ctxs, nameA, nameB };
  return <>
    <LocationDistribution {...props} />
    <ServePerformancePart {...props} />
    <ServeImpactPart {...props} />
    <FaultsPart {...props} />
    <ServingSummary match={match} {...props} />
  </>;
}

function LocationDistribution({ ctxs, nameA, nameB }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point']);
  const dist = serveDistribution(ctxs, f);
  const typeTotal = (t: ServeKind) => LOCATION_ROWS.reduce((n, l) => n + dist[l.value][t], 0);
  const locationTotal = (l: ServeSpot) => TYPE_COLUMNS.reduce((n, t) => n + dist[l][t.value], 0);
  const attemptsTotal = LOCATION_ROWS.reduce((n, l) => n + locationTotal(l.value), 0);
  return <>
    <h3>Location distribution</h3>
    {controls}
    <Table
      head={['Location', 'Total', ...TYPE_COLUMNS.map((t) => t.label)]}
      rows={[
        ...LOCATION_ROWS.map((l) => [l.label, share(locationTotal(l.value), attemptsTotal),
          ...TYPE_COLUMNS.map((t) => share(dist[l.value][t.value], typeTotal(t.value)))]),
        [<strong>Serves</strong>, attemptsTotal, ...TYPE_COLUMNS.map((t) => typeTotal(t.value))],
      ]}
    />
    <p className="muted small">Serve attempts including faults; % = share of each column. Unrecorded location counts as Body, unrecorded type as Flat.</p>
  </>;
}

function ServePerformancePart({ ctxs, nameA, nameB }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point', 'location']);
  return <>
    <h3>Serve performance</h3>
    {controls}
    <ServePerformanceTable perf={servePerformance(ctxs, f)} />
  </>;
}

function ServeImpactPart({ ctxs, nameA, nameB }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point', 'location']);
  const impact = serveImpactStats(ctxs, f);
  const n = Object.values(impact).reduce((sum, r) => sum + r.points, 0);
  const impactRow = (label: ReactNode, { points, won }: { points: number; won: number }): ReactNode[] =>
    [label, points, pct(points, n), won, pct(won, points)];
  // Double faults and return winners are always lost, so Won is left blank.
  const lostRow = (label: ReactNode, r: { points: number; won: number }, showWon = true): ReactNode[] =>
    impactRow(label, r).map((cell, i) => <span className="stat-lost">{showWon || i < 3 ? cell : ''}</span>);
  const group = (rows: ImpactRow[]) =>
    rows.reduce((sum, r) => ({ points: sum.points + impact[r].points, won: sum.won + impact[r].won }), { points: 0, won: 0 });
  return <>
    <h3>Serve impact</h3>
    {controls}
    <Table
      head={['', 'Points', `% of ${n}`, 'Won', 'Won %']}
      rows={[
        impactRow(<strong>Serve in control</strong>, group(['ace', 'return_error', 'serve_plus_one', 'serve_advantage'])),
        impactRow('- Ace', impact.ace),
        impactRow('- Return error', impact.return_error),
        impactRow('- Serve + 1', impact.serve_plus_one),
        impactRow('- Serve in control rally', impact.serve_advantage),
        lostRow(<strong>Return in control</strong>, group(['double_fault', 'return_winner', 'serve_disadvantage'])),
        lostRow('- Double fault', impact.double_fault, false),
        lostRow('- Return winner', impact.return_winner, false),
        // Won here is the returner's: receiver winners + server UEs.
        lostRow('- Lost return in control rally',
          { points: impact.serve_disadvantage.points, won: impact.serve_disadvantage.points - impact.serve_disadvantage.won }),
        impactRow(<strong>Neutralised</strong>, impact.neutralised),
        impactRow('State not recorded', impact.unknown),
      ]}
    />
    <p className="muted small">
      Each service point appears once; sub-rows add up to their group. % = share of service points (Lucky balls excluded). Won % =
      conversion for Serve in control, save rate for Return in control and winning rate for Neutralised. Double faults and
      return winners are always lost, so Won is blank; for Lost return in control rally, Won counts receiver winners and
      server unforced errors (points lost by the server). Older rally counts map
      to a state; rallies without either are State not recorded.
    </p>
  </>;
}

function FaultsPart({ ctxs, nameA, nameB }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point']);
  const faults = serveFaults(ctxs, f);
  const faultTypes = [...(['net', 'long', 'wide'] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
    { value: 'none' as const, label: 'Not recorded' }];
  const faultTotal = LOCATION_ROWS.reduce((sum, l) => sum + faultTypes.reduce((s, t) => s + faults[l.value][t.value], 0), 0);
  return <>
    <h3>Faults</h3>
    {controls}
    <Table
      head={['Location', ...faultTypes.map((t) => t.label), 'Total']}
      rows={LOCATION_ROWS.map((l) => [l.label, ...faultTypes.map((t) => share(faults[l.value][t.value], faultTotal)),
        share(faultTypes.reduce((s, t) => s + faults[l.value][t.value], 0), faultTotal)])}
    />
    <p className="muted small">Faulted serve attempts; % = share of all {faultTotal} faults shown.</p>
  </>;
}

function ServingSummary({ match, ctxs, nameA, nameB }: PartProps & { match: Match }) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt']);
  const held = serviceGamesHeld(match, ctxs, f);
  const bp = breakPointsSaved(ctxs, f);
  const repeats = locationRepeats(ctxs, f);
  return <>
    <h3>Serving summary</h3>
    {controls}
    <Table
      head={['', 'Result']}
      rows={[
        ['Service games held', ratio(held.held, held.played)],
        ['Break points saved', ratio(bp.saved, bp.faced)],
        ['Location repeats', ratio(repeats.repeats, repeats.compared)],
      ]}
    />
    <p className="muted small">
      Service games held: completed regular service games (Player and Set only). Break points saved: Player, Set and Court side.
      Location repeats: serves at the same location as the previous serve on the same side with the same serve number, within the
      selected set or through the whole match (Player, Set, Court side and Serve attempt).
    </p>
  </>;
}