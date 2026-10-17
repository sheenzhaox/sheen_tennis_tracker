import { useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, isLive, pointsForMatch } from '../../storage/db';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, matchDayKey, matchSortKey, surfaceLabel } from '../format';
import { servingTotals, type MatchContexts } from '../../stats/playerStats';
import { describeRules } from '../../model/rules';
import { finalisationLabel } from '../../model/match';
import { SERVE_LOCATIONS, SERVE_TYPES, type Match, type Point, type Side } from '../../model/types';
import {
  completeFirstServeGame,
  firstServeBands,
  firstServeGames,
  firstServeHoldThresholds,
  pointContexts,
  serveDistribution,
  serveFaults,
  serveImpactStats,
  serveLocationImpact,
  servePerformance,
  setOptions,
  type ImpactRow,
  type KeyPoint,
  type PointContext,
  type ServeFilters,
  type ServeKind,
  type ServeSpot,
} from '../../stats/matchStats';
import { KEY_POINTS, OptionalChips, ServePerformanceTable, SummaryStats, Table } from './StatsPage';
import { other } from '../../engine/score';
import { CONTROL_REVERSAL, controlSeries, matchControl, type ControlFactor } from '../../stats/momentum';

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
      <section aria-labelledby="analysis-momentum">
        <h2 id="analysis-momentum">Momentum Impact (Match Control Score)</h2>
        <MomentumImpact match={match} ctxs={ctxs} nameA={nameA} nameB={nameB} />
      </section>
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
function useServeFilters(ctxs: PointContext[], nameA: string, nameB: string, keys: FilterKey[], playerOnly = false): [ServeFilters, ReactNode] {
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
    {!playerOnly && <PickChips label="Player" value={server} onChange={setServer} options={[{ value: 'A', label: nameA }, { value: 'B', label: nameB }]} />}
    {!playerOnly && sets.length > 1 && <PickChips label="Set" value={set} onChange={setSet} options={[{ value: 'all', label: 'All sets' }, ...sets]} />}
    {!playerOnly && sets.length === 1 && <PickChips label="Set" value={sets[0].value} onChange={() => {}} options={sets} />}
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

type PartProps = { ctxs: PointContext[]; nameA: string; nameB: string; playerOnly?: boolean; records?: MatchContexts[] };

export function ServeStatistics({ match, ...props }: PartProps & { match: Match }) {
  return <>
    <LocationDistribution {...props} />
    <ServePerformancePart {...props} />
    <ServeImpactPart {...props} />
    <FaultsPart {...props} />
    <ServingSummary match={match} {...props} />
    <FirstServeRateImpact match={match} {...props} />
    <ServeLocationImpact {...props} />
  </>;
}

export function ServeLocationImpact(props: PartProps) {
  return <>
    <h3>Serve location impact</h3>
    <LocationOutcomeView {...props} mode="bars" />
    <LocationOutcomeView {...props} mode="heatmap" />
    <p className="muted small">Point wins / recorded service points, attributed to the final attempt; double faults count as second-serve losses.
      First-serve results exclude first faults followed by second serves. Lucky, manual and missing-serve points are excluded;
      tiebreak points are included. Missing location counts as Body and missing type as Flat; defaulted counts are shown.
      Observed associations, not causal effects or game/match-win predictions. Small samples limit comparisons.</p>
  </>;
}

function LocationOutcomeView({ ctxs, nameA, nameB, playerOnly = false, mode }: PartProps & { mode: 'bars' | 'heatmap' }) {
  const [player, setPlayer] = useState<Side>('A');
  const [set, setSet] = useState<number | All>('all');
  const [side, setSide] = useState<'deuce' | 'ad' | All>('all');
  const [keyPoint, setKeyPoint] = useState<KeyPoint | All>('all');
  const [kind, setKind] = useState<ServeKind | All>('all');
  const names = { A: nameA, B: nameB };
  const sets = setOptions(ctxs).map((option) => ({ value: option.index as number | All, label: option.label }));
  const displayed: Side[] = [player];
  const title = mode === 'bars' ? 'Point-Win-Rate Bars' : 'Court-Side Heatmap';
  return <div className="location-outcome-view" role="group" aria-label={title}>
    <h4>{title}</h4>
    {!playerOnly && <PickChips label="Location impact player" options={(['A', 'B'] as const).map((value) => ({ value, label: names[value] }))}
      value={player} onChange={setPlayer} />}
    {!playerOnly && sets.length > 0 && <PickChips label="Set" options={sets.length > 1 ? [{ value: 'all', label: 'All sets' }, ...sets] : sets}
      value={sets.length === 1 ? sets[0].value : set} onChange={setSet} />}
    {mode === 'bars' && <PickChips label="Court side" value={side} onChange={setSide}
      options={[{ value: 'all', label: 'All sides' }, { value: 'deuce', label: 'Deuce' }, { value: 'ad', label: 'Ad' }]} />}
    <PickChips label="Key points" value={keyPoint} onChange={setKeyPoint}
      options={[{ value: 'all', label: 'All points' }, ...KEY_POINTS]} />
    <PickChips label="Serve type" value={kind} onChange={setKind}
      options={[{ value: 'all', label: 'All types' }, ...SERVE_TYPES
        .map((option) => ({ value: option.value as ServeKind | All, label: option.label }))]} />
    {mode === 'heatmap' && <div className="location-heat-legend small" aria-label="Point-win-rate colour scale: 0% to 100%">
      <span>0%</span><span className="location-heat-scale" /><span>100%</span><span className="location-no-data-key">No data</span>
    </div>}
    {displayed.map((server) => {
      const cells = serveLocationImpact(ctxs, { server, sets: only(set), sides: only(side), attempts: [],
        keyPoints: only(keyPoint), locations: [] }, only(kind));
      const total = cells.reduce((count, cell) => count + cell.played, 0);
      const defaultLocation = cells.reduce((count, cell) => count + cell.defaultLocation, 0);
      const defaultType = cells.reduce((count, cell) => count + cell.defaultType, 0);
      return <div key={server} className="location-player" role="group" aria-label={`${names[server]} location outcomes`}>
        <h5 className={`serve-player-${server}`}>{names[server]}</h5>
        {total === 0 && <p role="status">No eligible recorded service points.</p>}
        <div className="location-attempts">
          {([1, 2] as const).map((attempt) => {
            const sample = cells.filter((cell) => cell.attempt === attempt);
            const played = sample.reduce((count, cell) => count + cell.played, 0);
            const won = sample.reduce((count, cell) => count + cell.won, 0);
            const overall = played ? won / played : 0;
            return <div key={attempt} className="location-attempt" role="group" aria-label={`${attempt === 1 ? '1st' : '2nd'} serve`}>
              <h6>{attempt === 1 ? '1st' : '2nd'} serve</h6>
              <p className="small">Overall: {ratio(won, played)}</p>
              {mode === 'bars' ? <>
                {LOCATION_ROWS.map((location) => {
                  const rows = sample.filter((cell) => cell.location === location.value);
                  const locationPlayed = rows.reduce((count, cell) => count + cell.played, 0);
                  const locationWon = rows.reduce((count, cell) => count + cell.won, 0);
                  return <div className="location-bar-row" key={location.value}>
                    <div className="location-bar-label"><span>{location.label}</span><span>{ratio(locationWon, locationPlayed)}</span></div>
                    <div className={`location-bar-track serve-player-${server}`} role="img"
                      aria-label={`${location.label}: ${ratio(locationWon, locationPlayed)}; overall ${pct(won, played)}`}>
                      <span className="location-bar-fill" style={{ width: `${locationPlayed ? locationWon / locationPlayed * 100 : 0}%` }} />
                      {played > 0 && <span className="location-bar-reference" style={{ left: `${overall * 100}%` }} />}
                    </div>
                  </div>;
                })}
                <div className="location-bar-axis small"><span>0%</span><span>50%</span><span>100%</span></div>
                <p className="muted small">Dashed marker: overall point-win rate</p>
              </> : <>
                <p className="location-net small">Net (server's view)</p>
                <div className="location-court">
                  {(['deuce', 'ad'] as const).map((courtSide) => <div key={courtSide}>
                    <div className="location-court-label small">{courtSide === 'deuce' ? 'Deuce' : 'Ad'}</div>
                    <div className="location-service-box">
                      {(courtSide === 'deuce' ? LOCATION_ROWS : [...LOCATION_ROWS].reverse()).map((location) => {
                        const cell = sample.find((row) => row.side === courtSide && row.location === location.value)!;
                        const rate = cell.played ? cell.won / cell.played : null;
                        return <div key={location.value} className={`location-heat-cell${rate === null ? ' location-no-data' : ''}`}
                          style={rate === null ? undefined : { backgroundColor: `hsl(174 45% ${95 - rate * 45}%)` }}
                          aria-label={`${courtSide === 'deuce' ? 'Deuce' : 'Ad'} ${location.label}: ${ratio(cell.won, cell.played)}`}>
                          <strong>{location.label}</strong><span>{cell.played ? `${cell.won}/${cell.played}` : '-'}</span><span>{pct(cell.won, cell.played)}</span>
                        </div>;
                      })}
                    </div>
                  </div>)}
                </div>
              </>}
            </div>;
          })}
        </div>
        <p className="muted small">{total} eligible points; defaulted location (Body): {defaultLocation}; defaulted type (Flat): {defaultType}.</p>
        {mode === 'heatmap' && <details><summary>Location outcome details</summary>
          <Table head={['Serve', 'Court side', 'Location', 'Won / points', 'Default Body', 'Default Flat']}
            rows={cells.map((cell) => [cell.attempt === 1 ? '1st' : '2nd', cell.side === 'deuce' ? 'Deuce' : 'Ad',
              LOCATION_ROWS.find((location) => location.value === cell.location)!.label, ratio(cell.won, cell.played), cell.defaultLocation, cell.defaultType])} />
        </details>}
      </div>;
    })}
  </div>;
}

export function FirstServeRateImpact({ match, ctxs, nameA, nameB, playerOnly = false, records }: PartProps & { match: Match }) {
  const [chartPlayer, setChartPlayer] = useState<Side[]>([]);
  const [bandPlayer, setBandPlayer] = useState<Side[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const names = { A: nameA, B: nameB };
  const options = (playerOnly ? ['A'] as const : ['A', 'B'] as const).map((value) => ({ value, label: names[value] }));
  const sources = records ? [...records].sort((left, right) => matchDayKey(left.match) - matchDayKey(right.match) ||
    matchSortKey(left.match) - matchSortKey(right.match) || left.match.id.localeCompare(right.match.id)) : [{ match, contexts: ctxs }];
  const games = sources.flatMap((source, index) => firstServeGames(source.match, source.contexts).map((game) => ({ ...game,
    matchId: source.match.id, matchNumber: index + 1,
    matchLabel: `Match ${index + 1}${formatMatchDay(source.match) ? ` (${formatMatchDay(source.match)})` : ''}` })));
  const chartGames = games.filter((game) => playerOnly ? game.server === 'A' : chartPlayer.length === 0 || chartPlayer.includes(game.server));
  const chartPlayers: Side[] = playerOnly ? ['A'] : chartPlayer.length ? chartPlayer : ['A', 'B'];
  const thresholds = chartPlayers.flatMap((player) => firstServeHoldThresholds(games, player).map((threshold) => ({ ...threshold, player })));
  const players: Side[] = playerOnly ? ['A'] : bandPlayer.length ? bandPlayer : ['A', 'B'];
  const bands = players.map((player) => firstServeBands(games, player));
  const gameLabel = (game: typeof games[number]) => `${records ? `${game.matchLabel}, ` : ''}Set ${game.set + 1}, game ${game.game}`;
  const gameKey = (game: typeof games[number]) => `${game.matchId}:${game.set}:${game.game}`;
  const detail = chartGames.find((game) => gameKey(game) === selected);
  const width = Math.max(360, chartGames.length * 56 + 64);
  const bandSummary = (player: Side) => {
    const sample = games.filter((game) => game.server === player);
    const eligible = sample.filter(completeFirstServeGame);
    return `${names[player]}: ${eligible.length} eligible games; ${sample.length - eligible.length} omitted`;
  };
  return <>
    <h3>First serve rate impact</h3>
    <h4>Game-by-Game Chart</h4>
    {!playerOnly && <OptionalChips label="Chart player" options={options} value={chartPlayer} onChange={setChartPlayer} />}
    <div className="serve-impact-legend">
      {options.filter((option) => chartPlayer.length === 0 || chartPlayer.includes(option.value)).map((option) =>
        <span key={option.value} className={`serve-player-${option.value}`}>{option.label}</span>)}
      <span><Check size={18} aria-hidden="true" /> Held</span><span><X size={18} aria-hidden="true" /> Broken</span>
      <span><svg width={28} height={12} aria-hidden="true"><line x1={0} x2={28} y1={6} y2={6} className="serve-threshold-line serve-threshold-75" /></svg> P75</span>
    </div>
    {chartGames.length === 0 ? <p role="status">No completed regular service games.</p> : <>
      <div className="first-serve-chart-scroll" role="region" aria-label="First-serve game chart" tabIndex={0}>
        <svg width={width} height={280} viewBox={`0 0 ${width} 280`} role="group" aria-label="First serves in by service game">
          {[0, 25, 50, 75, 100].map((value) => <g key={value}>
            <line x1={48} x2={width - 16} y1={220 - value * 1.8} y2={220 - value * 1.8} className="serve-chart-grid" />
            <text x={40} y={224 - value * 1.8} textAnchor="end">{value}%</text>
          </g>)}
          {thresholds.map((threshold) => threshold.cutoff !== null && <line key={`${threshold.player}:${threshold.target}`}
            x1={48} x2={width - 16} y1={220 - threshold.cutoff * 180} y2={220 - threshold.cutoff * 180}
            className={`serve-threshold-line serve-threshold-${threshold.target * 100} serve-player-${threshold.player}`}
            aria-label={`${names[threshold.player]} P${threshold.target * 100}: ${pct(threshold.cutoff, 1)}, ${ratio(threshold.held, threshold.played)} held`}>
            <title>{names[threshold.player]} P{threshold.target * 100}: {pct(threshold.cutoff, 1)}, {ratio(threshold.held, threshold.played)} held</title>
          </line>)}
          {chartGames.map((game, index) => {
            const horizontal = 76 + index * ((width - 112) / Math.max(1, chartGames.length - 1));
            const vertical = 220 - (game.firstIn / Math.max(1, game.attempts)) * 180;
            const label = `${gameLabel(game)}, ${names[game.server]}, ${game.held ? 'Held' : 'Broken'}, ${ratio(game.firstIn, game.attempts)}`;
            return <g key={gameKey(game)}>
              <text x={horizontal} y={247} textAnchor="middle">{records && <tspan x={horizontal}>M{game.matchNumber}</tspan>}
                <tspan x={horizontal} dy={records ? 17 : 0}>S{game.set + 1} G{game.game}</tspan></text>
              {completeFirstServeGame(game) ? <g role="button" tabIndex={0} aria-label={label}
                aria-pressed={selected === gameKey(game)} className={`serve-chart-point serve-player-${game.server}`}
                onClick={() => setSelected(gameKey(game))} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(gameKey(game)); }
                }}>
                <title>{label}</title>
                <rect x={horizontal - 22} y={vertical - 22} width={44} height={44} fill="transparent" />
                {game.held ? <Check x={horizontal - 10} y={vertical - 10} width={20} height={20} strokeWidth={3} aria-hidden="true" />
                  : <X x={horizontal - 10} y={vertical - 10} width={20} height={20} strokeWidth={3} aria-hidden="true" />}
              </g> : <text x={horizontal} y={235} textAnchor="middle">-</text>}
            </g>;
          })}
        </svg>
      </div>
      <ul className="serve-threshold-summary small" aria-label="Observed hold-rate thresholds">
        {thresholds.map((threshold) => <li key={`${threshold.player}:${threshold.target}`} className={`serve-player-${threshold.player}`}>
          {names[threshold.player]} P{threshold.target * 100}: {threshold.cutoff === null ? 'Not reached'
            : `${pct(threshold.cutoff, 1)}+ | ${ratio(threshold.held, threshold.played)} held`}
        </li>)}
      </ul>
      <p className="first-serve-detail small" role="status">{detail
        ? `${gameLabel(detail)} | ${names[detail.server]} | ${detail.held ? 'Held' : 'Broken'} | First serves in: ${ratio(detail.firstIn, detail.attempts)} | Coverage: ${detail.attempts}/${detail.eligiblePoints} | Lucky excluded: ${detail.luckyPoints}`
        : `${chartGames.filter(completeFirstServeGame).length} plotted; ${chartGames.filter((game) => !completeFirstServeGame(game)).length} omitted for incomplete or absent serve data.`}</p>
      <details><summary>Game details</summary>
        <Table head={['Game', 'Server', 'Result', '1st serve in', 'Coverage', 'Lucky excluded']}
          rows={chartGames.map((game) => [gameLabel(game), names[game.server], game.held ? 'Held' : 'Broken',
            completeFirstServeGame(game) ? ratio(game.firstIn, game.attempts) : 'Incomplete',
            `${game.attempts}/${game.eligiblePoints}`, game.luckyPoints])} />
      </details>
    </>}
    <h4>Hold Rate by First-Serve Threshold</h4>
    {!playerOnly && <OptionalChips label="Band table player" options={options} value={bandPlayer} onChange={setBandPlayer} />}
    <Table head={['First serves in', ...players.map((player) => names[player])]}
      rows={[
        ...bands[0].map((band, index) => [band.label, ...bands.map((playerBands) => ratio(playerBands[index].held, playerBands[index].played))]),
        [<strong>Overall hold rate</strong>, ...players.map((player) => {
          const sample = games.filter((game) => game.server === player && completeFirstServeGame(game));
          return ratio(sample.filter((game) => game.held).length, sample.length);
        })],
      ]} />
    <p className="muted small">{players.map(bandSummary).join('. ')}.</p>
    <p className="muted small">First serves in / first attempts, including first faults. Completed regular service games only;
      tiebreaks and match tiebreaks excluded. Rates exclude Lucky points; games with missing non-Lucky serve records are omitted.
      Cumulative results are held games / eligible games; 40%+, 60%+ and 80%+ overlap.
      P75 marks the lowest observed first-serve-in cutoff with at least 75% holds at or above that rate.
      These are observed samples, not predictions; higher cutoffs need not retain that hold rate. Small samples and opponent strength limit comparisons.</p>
  </>;
}

function LocationDistribution({ ctxs, nameA, nameB, playerOnly }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point'], playerOnly);
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

function ServePerformancePart({ ctxs, nameA, nameB, playerOnly }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point', 'location'], playerOnly);
  return <>
    <h3>Serve performance</h3>
    {controls}
    <ServePerformanceTable perf={servePerformance(ctxs, f)} />
  </>;
}

function ServeImpactPart({ ctxs, nameA, nameB, playerOnly }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point', 'location'], playerOnly);
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

function FaultsPart({ ctxs, nameA, nameB, playerOnly }: PartProps) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt', 'point'], playerOnly);
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

function ServingSummary({ match, ctxs, nameA, nameB, playerOnly, records }: PartProps & { match: Match }) {
  const [f, controls] = useServeFilters(ctxs, nameA, nameB, ['side', 'attempt'], playerOnly);
  const total = servingTotals(records ?? [{ match, contexts: ctxs }], f);
  return <>
    <h3>Serving summary</h3>
    {controls}
    <Table
      head={['', 'Result']}
      rows={[
        ['Service games held', ratio(total.held, total.played)],
        ['Break points saved', ratio(total.saved, total.faced)],
        ['Location repeats', ratio(total.repeats, total.compared)],
      ]}
    />
    <p className="muted small">
      {playerOnly ? 'Service games held: completed regular service games, pooled across selected matches. Break points saved: Court side filter.'
        : 'Service games held: completed regular service games (Player and Set only). Break points saved: Player, Set and Court side.'}
      {' '}Location repeats: serves at the same location as the previous serve on the same side with the same serve number,
      {playerOnly ? ' resetting at each match boundary (Court side and Serve attempt).'
        : ' within the selected set or through the whole match (Player, Set, Court side and Serve attempt).'}
    </p>
  </>;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const signed = (n: number) => `${n > 0 ? '+' : ''}${num(n)}`;
const RISE = '#2e7d32';
const FALL = '#c62828';

function factorLabel(f: ControlFactor, names: Record<Side, string>, X: Side): string {
  if (f.kind === 'set') return 'Set result';
  if (f.kind !== 'games') return `${names[f.side]} ${f.kind} (${f.count})`;
  const { holds, breaks, tiebreakWinner } = f;
  const plural = (n: number, word: string) => (n ? `${n} ${word}${n > 1 ? 's' : ''}` : '');
  const games = (S: Side) => {
    const text = [plural(holds[S], 'hold'), plural(breaks[S], 'break')].filter(Boolean).join(', ');
    return text && `${names[S]} ${text}`;
  };
  return [games(X), games(other(X)), tiebreakWinner ? `Tiebreak won by ${names[tiebreakWinner]}` : '']
    .filter(Boolean).join('; ');
}

export function MomentumImpact({ match, ctxs, nameA, nameB }: PartProps & { match: Match }) {
  const [player, setPlayer] = useState<Side>('A');
  const names = { A: nameA, B: nameB };
  const control = matchControl(match, ctxs);
  if (!control.points) return <p role="status">No points recorded.</p>;
  const me = names[player], opp = names[other(player)];
  const series = controlSeries(control, player);
  const all = series.sets.flatMap((s) => s.values);
  const max = Math.max(...all), min = Math.min(...all);
  const lo = Math.min(0, min) - 14, hi = Math.max(0, max) + 16;
  const slots = all.length + series.sets.length - 1;
  const padL = 64, padR = 60, padT = 84, padB = 40, H = 460;
  const W = Math.max(720, padL + padR + (slots - 1) * 5);
  const x = (slot: number) => padL + (slot * (W - padL - padR)) / Math.max(1, slots - 1);
  const y = (v: number) => padT + ((hi - v) * (H - padT - padB)) / (hi - lo);
  const half = (x(1) - x(0)) / 2;
  const bottom = H - padB;
  let slot = 0;
  const layout = series.sets.map((s) => {
    const xs = s.values.map(() => x(slot++));
    slot++;
    return { ...s, xs };
  });
  const at = (setIndex: number, index: number) => {
    const s = layout[setIndex];
    if (index === 0) return 'set start';
    if (index === s.values.length - 1) return s.set.winner ? 'set end' : 'last point';
    return s.set.steps[index - 1].score;
  };
  const coverage = `${control.recorded}/${control.points} (${pct(control.recorded, control.points)})`;
  return <>
    <PickChips label="Momentum player" value={player} onChange={setPlayer}
      options={(['A', 'B'] as const).map((value) => ({ value, label: names[value] }))} />
    <div className="first-serve-chart-scroll" role="region" aria-label="Match Control Score chart" tabIndex={0}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Match Control Score ${me} (vs ${opp}): ${me}'s score minus ${opp}'s by point`}>
        <rect width={W} height={H} fill="#fff" />
        {layout.map((s, setIndex) => {
          const bands: ReactNode[] = [];
          const labels: ReactNode[] = [];
          let shade = false;
          let gameStart: number | null = null;
          s.set.steps.forEach((step, k) => {
            const i = k + 1, b = step.ctx.before;
            const key = b.inTiebreak ? 'TB' : `${b.games.a}-${b.games.b}`;
            const next = s.set.steps[k + 1]?.ctx.before;
            if (gameStart === null) {
              gameStart = i;
              if (!b.inTiebreak) labels.push(<text key={`g${i}`} x={s.xs[i] - half + 2} y={padT + 10} fontSize={9} fill="#555">{key}</text>);
            }
            if (b.inTiebreak && (b.points.a + b.points.b) % 6 === 0) {
              labels.push(<g key={`t${i}`}>
                <line x1={s.xs[i] - half} x2={s.xs[i] - half} y1={padT} y2={bottom} stroke="#999" strokeDasharray="2,3" />
                <text x={s.xs[i] - half + 2} y={padT + 10} fontSize={9} fill="#555">{b.points.a}-{b.points.b}</text>
              </g>);
            }
            if (!next || (next.inTiebreak ? 'TB' : `${next.games.a}-${next.games.b}`) !== key) {
              if (shade) bands.push(<rect key={`b${i}`} x={s.xs[gameStart] - half} y={padT} width={s.xs[i] - s.xs[gameStart] + 2 * half}
                height={bottom - padT} fill="#ececec" />);
              shade = !shade;
              gameStart = null;
            }
          });
          return <g key={`bands${setIndex}`}>{bands}{labels}</g>;
        })}
        <text x={padL} y={18} fontSize={14}>{`Match Control Score ${me} (vs ${opp})`}</text>
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#333" />
        <text transform={`translate(16 ${(padT + bottom) / 2}) rotate(-90)`} fontSize={12} textAnchor="middle">Match Control Score</text>
        {[...new Set([max, 0, min])].map((v) => <text key={v} x={padL - 6} y={y(v) + 4} fontSize={11} textAnchor="end">{num(v)}</text>)}
        {layout.map((s, setIndex) => {
          const path = s.values.map((v, i) => `${i ? 'L' : 'M'}${s.xs[i].toFixed(1)},${y(v).toFixed(1)}`).join('');
          const won = s.set.winner ? `won by ${names[s.set.winner]}` : 'unfinished';
          return <g key={`set${setIndex}`}>
            <text x={s.xs[0]} y={padT - 40} fontSize={12} fontWeight="bold">{`${s.set.label} (${won})`}</text>
            {setIndex > 0 && <line x1={s.xs[0] - 2 * half} x2={s.xs[0] - 2 * half} y1={padT - 54} y2={bottom} stroke="#bbb" strokeDasharray="4" />}
            <circle cx={s.xs[0]} cy={y(s.values[0])} r={3} fill="#fff" stroke="#1565c0"><title>{s.set.label} start {num(s.values[0])}</title></circle>
            <path d={path} fill="none" stroke="#1565c0" strokeWidth={2} />
            {s.turns.map((t) => {
              const px = s.xs[t.index], py = y(t.value), peak = t.type === 'peak';
              const color = peak ? FALL : RISE;
              const tri = peak ? `${px - 6},${py - 12} ${px + 6},${py - 12} ${px},${py - 3}` : `${px - 6},${py + 12} ${px + 6},${py + 12} ${px},${py + 3}`;
              const ty = peak ? py - 30 : py + 26;
              const score = s.set.steps[t.index - 1].score;
              return <g key={t.index}>
                <title>{`${peak ? 'Peak' : 'Trough'} at ${score}: ${num(t.value)}, then ${signed(t.swing)}`}</title>
                <polygon points={tri} fill={color} />
                <text x={px} y={ty} fontSize={11} textAnchor="middle" fill={color}>{score}</text>
                <text x={px} y={ty + 12} fontSize={11} textAnchor="middle" fill={color}>{num(t.value)} → {signed(t.swing)}</text>
              </g>;
            })}
          </g>;
        })}
        {series.segments.map((g) => {
          const s = layout[g.setIndex], color = g.change >= 0 ? RISE : FALL;
          return <g key={g.number}>
            <title>{`${g.number}. ${signed(g.change)}${g.biggest ? `: ${factorLabel(g.biggest, names, player)} ${signed(g.biggest.value)}` : ''}`}</title>
            <line x1={s.xs[g.from]} x2={s.xs[g.to]} y1={bottom + 8} y2={bottom + 8} stroke={color} strokeWidth={4} />
            <text x={(s.xs[g.from] + s.xs[g.to]) / 2} y={bottom + 24} fontSize={11} textAnchor="middle" fill={color}>{g.number}</text>
          </g>;
        })}
      </svg>
    </div>
    {series.segments.length > 0 && <Table head={['#', 'Set', 'From → to', 'Change', 'Biggest factor']}
      rows={series.segments.map((g) => [g.number, layout[g.setIndex].set.label, `${at(g.setIndex, g.from)} → ${at(g.setIndex, g.to)}`,
        <strong style={{ color: g.change >= 0 ? RISE : FALL }}>{signed(g.change)}</strong>,
        g.biggest ? <>{factorLabel(g.biggest, names, player)} <strong>{signed(g.biggest.value)}</strong></> : '-'])} />}
    <p className="muted small">{me}'s Match Control Score minus {opp}'s after each point; each set is drawn separately from its
      set-start score (previous set result ±3 plus closing form, capped). Own winners +1, unforced errors −1 and double faults −2,
      with extras for winner runs, error runs and key points; holds, breaks, tiebreaks and sets add outcome points.
      Red ▼ peaks and green ▲ troughs are turning points confirmed by a reversal of {CONTROL_REVERSAL} or more, labelled with the
      score before that point and the following swing. Numbered segments run between turning points; segments inside a single game
      (or a 6-point tiebreak block) are not listed. Biggest factor: the largest contribution in the direction of the change.</p>
    <p className="muted small">Recorded point endings: {coverage}. Lucky and unrecorded points score 0. Fixed coaching weights;
      not a measure of cause or win probability.</p>
  </>;
}