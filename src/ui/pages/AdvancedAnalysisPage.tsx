import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, isLive, pointsForMatch } from '../../storage/db';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, surfaceLabel } from '../format';
import { describeRules } from '../../model/rules';
import { finalisationLabel } from '../../model/match';
import { SERVE_LOCATIONS, SERVE_TYPES, type Match, type Point, type ServeLocation, type ServeType, type Side } from '../../model/types';
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
  type KeyPoint,
  type PointContext,
  type ServeFilters,
  type ServePerformance,
} from '../../stats/matchStats';
import { Chips, SummaryStats, Table } from './StatsPage';

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
          <dt>Date</dt><dd>{formatMatchDay(match) || 'Not recorded'}</dd>
          <dt>Location</dt><dd>{match.venue || 'Not recorded'}</dd>
          <dt>Event</dt><dd>{match.event || 'Not recorded'}</dd>
          <dt>Round</dt><dd>{match.round || 'Not recorded'}</dd>
          <dt>Surface</dt><dd>{surfaceLabel(match.surface) || 'Not recorded'}</dd>
          <dt>Format</dt><dd>{match.ruleSetName}<br />{describeRules(match.rules)}</dd>
          {match.firstServer && <><dt>First server</dt><dd>{match.firstServer === 'A' ? nameA : nameB}</dd></>}
          {match.ownerName && <><dt>Recorded by</dt><dd>{match.ownerName}</dd></>}
          {match.notes && <><dt>Notes</dt><dd className="analysis-notes">{match.notes}</dd></>}
        </dl>
        {match.finalisation && <p>{finalisationLabel(match, nameA, nameB)}</p>}
      </section>
      <section aria-labelledby="analysis-general">
        <h2 id="analysis-general">General Statistics</h2>
        <SummaryStats contexts={ctxs} nameA={nameA} nameB={nameB} />
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
const tone = (n: number) => (n > 0 ? 'stat-good' : n < 0 ? 'stat-bad' : 'stat-even');
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** At most one choice; tapping the selected chip clears it (none selected = all). */
function OptionalChips<T extends string | number>({ label, options, value, onChange }: {
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

const LOCATION_ROWS: { value: ServeLocation; label: string }[] = [...SERVE_LOCATIONS, { value: 'none', label: 'Not recorded' }];
const TYPE_COLUMNS: { value: ServeType; label: string }[] = [...SERVE_TYPES, { value: 'none', label: 'Type not recorded' }];
const KEY_POINTS: { value: KeyPoint; label: string }[] = [
  { value: 'first', label: 'First point' },
  { value: 'game', label: 'Game points' },
  { value: 'break', label: 'Break points' },
  { value: 'tiebreak', label: 'Tiebreak' },
];

export function ServeStatistics({ match, ctxs, nameA, nameB }: { match: Match; ctxs: PointContext[]; nameA: string; nameB: string }) {
  const [server, setServer] = useState<Side>('A');
  const [sets, setSets] = useState<number[]>([]);
  const [sides, setSides] = useState<ServeFilters['sides']>([]);
  const [attempts, setAttempts] = useState<number[]>([]);
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [locations, setLocations] = useState<ServeLocation[]>([]);
  const f: ServeFilters = { server, sets, sides, attempts, keyPoints, locations };

  const dist = serveDistribution(ctxs, f);
  const typeTotal = (t: ServeType) => LOCATION_ROWS.reduce((n, l) => n + dist[l.value][t], 0);
  const locationTotal = (l: ServeLocation) => TYPE_COLUMNS.reduce((n, t) => n + dist[l][t.value], 0);
  const attemptsTotal = LOCATION_ROWS.reduce((n, l) => n + locationTotal(l.value), 0);

  const perf = servePerformance(ctxs, f);
  const perfColumns: (ServeType | 'all')[] = ['all', ...TYPE_COLUMNS.map((t) => t.value)];
  const perfRow = (label: string, className: string, key: keyof ServePerformance): ReactNode[] =>
    [<span className={className}>{label}</span>, ...perfColumns.map((c) => share(perf[c][key], perf[c].points))];

  const impact = serveImpactStats(ctxs, f);
  const n = perf.all.points;
  const impactRow = (label: ReactNode, { points, won }: { points: number; won: number }): ReactNode[] =>
    [label, points, pct(points, n), won, pct(won, points)];
  const direct = (['ace', 'return_error', 'double_fault', 'return_winner'] as const)
    .reduce((sum, r) => ({ points: sum.points + impact[r].points, won: sum.won + impact[r].won }), { points: 0, won: 0 });

  const faults = serveFaults(ctxs, f);
  const faultTypes = [...(['net', 'long', 'wide'] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
    { value: 'none' as const, label: 'Not recorded' }];
  const faultTotal = LOCATION_ROWS.reduce((sum, l) => sum + faultTypes.reduce((s, t) => s + faults[l.value][t.value], 0), 0);

  const held = serviceGamesHeld(match, ctxs, f);
  const bp = breakPointsSaved(ctxs, f);
  const repeats = locationRepeats(ctxs, f);

  return <>
    <Chips value={server} onChange={setServer} options={[{ value: 'A', label: nameA }, { value: 'B', label: nameB }]} />
    <OptionalChips label="Sets" options={setOptions(ctxs).map((o) => ({ value: o.index, label: o.label }))} value={sets} onChange={setSets} />
    <OptionalChips label="Court side" options={[{ value: 'deuce', label: 'Deuce' }, { value: 'ad', label: 'Ad' }]} value={sides} onChange={setSides} />
    <OptionalChips label="Serve attempt" options={[{ value: 1, label: '1st serve' }, { value: 2, label: '2nd serve' }]} value={attempts} onChange={setAttempts} />
    <OptionalChips label="Key points" options={KEY_POINTS} value={keyPoints} onChange={setKeyPoints} />
    <p className="muted small">Filters: pick one or none in each row; none selected = all.</p>

    <h3>Location distribution</h3>
    <Table
      head={['Location', 'Total', ...TYPE_COLUMNS.map((t) => t.label)]}
      rows={[
        ...LOCATION_ROWS.map((l) => [l.label, share(locationTotal(l.value), attemptsTotal),
          ...TYPE_COLUMNS.map((t) => share(dist[l.value][t.value], typeTotal(t.value)))]),
        [<strong>Serves</strong>, attemptsTotal, ...TYPE_COLUMNS.map((t) => typeTotal(t.value))],
      ]}
    />
    <p className="muted small">Serve attempts including faults; % = share of each column.</p>

    <OptionalChips label="Serve location" options={SERVE_LOCATIONS} value={locations} onChange={setLocations} />
    <p className="muted small">Location filter applies to the performance and impact tables.</p>

    <h3>Serve performance</h3>
    <Table
      head={['', 'Total', ...TYPE_COLUMNS.map((t) => t.label)]}
      rows={[
        [<strong>Service points</strong>, ...perfColumns.map((c) => perf[c].points)],
        perfRow('Serve winners', 'stat-good', 'serveWinners'),
        perfRow('Serve + 1', 'stat-good', 'servePlusOne'),
        perfRow('Win due to serve', 'stat-good', 'wonDueToServe'),
        perfRow('UE during Serve advantage', 'stat-bad', 'ueInAdvantage'),
        perfRow('Double faults', 'stat-bad', 'doubleFaults'),
        perfRow('Lost due to serve', 'stat-bad', 'lostDueToServe'),
        ['Serve score', ...perfColumns.map((c) => {
          const score = perf[c].wonDueToServe - perf[c].lostDueToServe;
          const per100 = perf[c].points ? `${signed(Math.round((score / perf[c].points) * 1000) / 10)} / 100` : '-';
          return <span className={tone(score)}>{signed(score)} ({per100})</span>;
        })],
      ]}
    />
    <p className="muted small">
      Points count under their last serve (2nd serve includes double faults); type columns use that serve's type. % = share of the
      column's service points. Rows overlap and must not be added up. Win due to serve = ace, return error, Serve + 1, or server
      winner / receiver UE in a Serve advantage point. Lost due to serve = double fault, return ace, or receiver winner / server UE in
      a Return advantage point. Serve score = Win - Lost due to serve, also per 100 service points.
    </p>

    <h3>Serve impact</h3>
    <Table
      head={['', 'Points', `% of ${n}`, 'Won', 'Won %']}
      rows={[
        impactRow(<strong>Direct ending</strong>, direct),
        impactRow('- Ace', impact.ace),
        impactRow('- Return error', impact.return_error),
        impactRow('- Double fault', impact.double_fault),
        impactRow('- Return winner', impact.return_winner),
        impactRow('Serve + 1', impact.serve_plus_one),
        impactRow('Serve advantage', impact.serve_advantage),
        impactRow('Return advantage', impact.serve_disadvantage),
        impactRow('Neutralised', impact.neutralised),
        impactRow('State not recorded', impact.unknown),
      ]}
    />
    <p className="muted small">
      Each service point appears once (sub-rows add up to Direct ending). Won % of Serve advantage = advantage conversion. Older
      rally counts map to a state; rallies without either are State not recorded.
    </p>

    <h3>Faults</h3>
    <Table
      head={['Location', ...faultTypes.map((t) => t.label), 'Total']}
      rows={LOCATION_ROWS.map((l) => [l.label, ...faultTypes.map((t) => share(faults[l.value][t.value], faultTotal)),
        share(faultTypes.reduce((s, t) => s + faults[l.value][t.value], 0), faultTotal)])}
    />
    <p className="muted small">Faulted serve attempts; % = share of all {faultTotal} faults shown. Location filter does not apply.</p>

    <h3>Serving summary</h3>
    <Table
      head={['', 'Result']}
      rows={[
        ['Service games held', ratio(held.held, held.played)],
        ['Break points saved', ratio(bp.saved, bp.faced)],
        ['Location repeats', ratio(repeats.repeats, repeats.compared)],
      ]}
    />
    <p className="muted small">
      Service games held: completed regular service games (Set filter only). Break points saved: Set and Court side filters.
      Location repeats: serves at the same location as the previous serve on the same side with the same serve number, within the
      selected set or through the whole match (Set, Court side and Serve attempt filters); Not recorded breaks the chain.
    </p>
  </>;
}