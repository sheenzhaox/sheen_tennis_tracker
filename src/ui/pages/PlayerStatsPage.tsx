import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, isLive, matchesForPlayer, pointsForMatch } from '../../storage/db';
import { playerStats } from '../../stats/playerStats';
import type { Match, Player } from '../../model/types';
import { canViewPlayerStats, useUser } from '../user';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, matchDayKey, matchSortKey } from '../format';
import { StatsView } from './StatsPage';

export const PLAYER_STATS_PERIODS = [
  { value: 'last', label: 'Last match' },
  { value: 'last3', label: 'Last 3 matches' },
  { value: 'month', label: 'Within a month' },
  { value: 'sixMonths', label: 'Last 6 months' },
  { value: 'custom', label: 'Customize' },
] as const;
export type PlayerStatsPeriod = typeof PLAYER_STATS_PERIODS[number]['value'];

export function completedPlayerMatches(matches: Match[], playerId: string): Match[] {
  return matches.filter((match) => !match.deletedAt && match.status === 'completed' &&
    (match.playerAId === playerId || match.playerBId === playerId))
    .sort((a, b) => matchDayKey(b) - matchDayKey(a) || matchSortKey(b) - matchSortKey(a) || a.id.localeCompare(b.id));
}

export function selectPlayerMatches(matches: Match[], playerId: string, period: PlayerStatsPeriod, customIds: string[] = [], now = Date.now()): Match[] {
  const completed = completedPlayerMatches(matches, playerId);
  switch (period) {
    case 'last': return completed.slice(0, 1);
    case 'last3': return completed.slice(0, 3);
    case 'custom': return completed.filter((match) => customIds.includes(match.id));
    case 'month':
    case 'sixMonths': {
      const today = new Date(now);
      const start = new Date(today.getFullYear(), today.getMonth() - (period === 'month' ? 1 : 6), 1);
      const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      start.setDate(Math.min(today.getDate(), lastDay));
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      return completed.filter((match) => matchDayKey(match) >= start.getTime() && matchDayKey(match) < end.getTime());
    }
  }
}

export function PlayerStatsControls({ player, matches, names, period, customIds, onPeriodChange, onCustomChange }: {
  player: Player; matches: Match[]; names: Map<string, string>; period: PlayerStatsPeriod; customIds: string[];
  onPeriodChange: (period: PlayerStatsPeriod) => void; onCustomChange: (ids: string[]) => void;
}) {
  return <section className="form player-stats-controls" aria-label="Player stats match selection">
    <fieldset>
      <legend>Matches to include</legend>
      <div className="chips">
        {PLAYER_STATS_PERIODS.map((option) => <button key={option.value} type="button"
          className={`chip ${period === option.value ? 'on' : ''}`} aria-pressed={period === option.value}
          onClick={() => onPeriodChange(option.value)}>{option.label}</button>)}
      </div>
    </fieldset>
    <p className="muted">Completed matches only, including manually finalised matches. Month windows use the match date and run up to today.</p>
    {period === 'custom' && <fieldset>
      <legend>Select matches</legend>
      <div className="share-actions">
        <button type="button" className="btn btn-compact" disabled={!matches.length} onClick={() => onCustomChange(matches.map((match) => match.id))}>Select all</button>
        <button type="button" className="btn btn-compact" disabled={!customIds.length} onClick={() => onCustomChange([])}>Clear selection</button>
      </div>
      <ul className="list stats-match-selection">
        {matches.map((match) => <li key={match.id}>
          <label className="checkbox">
            <input type="checkbox" checked={customIds.includes(match.id)} onChange={(event) =>
              onCustomChange(event.target.checked ? [...customIds, match.id] : customIds.filter((id) => id !== match.id))} />
            <span>
              <strong>vs {names.get(match.playerAId === player.id ? match.playerBId : match.playerAId) ?? 'Unknown'}</strong>
              <span className="muted">{[formatMatchDay(match), match.event, match.ownerName && `by ${match.ownerName}`].filter(Boolean).join(' · ')}</span>
            </span>
          </label>
        </li>)}
      </ul>
    </fieldset>}
  </section>;
}

export default function PlayerStatsPage({ id, back = `/players/${id}` }: { id: string; back?: string }) {
  const user = useUser();
  const names = usePlayerNames();
  const [period, setPeriod] = useState<PlayerStatsPeriod>('last');
  const [customIds, setCustomIds] = useState<string[]>([]);
  const data = useLiveQuery(async () => {
    const player = await db.players.get(id);
    if (!isLive(player) || !canViewPlayerStats(user, player)) return null;
    const matches = completedPlayerMatches(await matchesForPlayer(id), id);
    const records = await Promise.all(matches.map(async (match) => ({ match, points: await pointsForMatch(match.id) })));
    return { player, records };
  }, [id, user]);
  if (data === undefined || data === null) return <>
    <Header title="Player stats" back={back} />
    <main className="page">{data === undefined ? <p role="status">Loading player stats...</p> : <p>
      {user.role === 'user' ? 'Player stats are available only for your linked System Player.' :
        user.role === 'coach' ? 'Player stats are available only for System Players in your assigned clubs.' : 'Player stats are available for System Players only.'}
    </p>}</main>
  </>;
  const matches = data.records.map((record) => record.match);
  const selected = new Set(selectPlayerMatches(matches, id, period, customIds).map((match) => match.id));
  const records = data.records.filter((record) => selected.has(record.match.id));
  const stats = playerStats(id, records);
  const { player } = data;
  const controls = <PlayerStatsControls player={player} matches={matches} names={names}
    period={period} customIds={customIds} onPeriodChange={setPeriod} onCustomChange={setCustomIds} />;
  if (!records.length) return <>
    <Header title="Player stats" back={back} />
    <main className="page">
      <h2>{player.name}</h2>
      {controls}
      <p className="muted" role="status">{!matches.length ? 'No completed matches visible to your account for this player.' :
        period === 'custom' ? 'Select one or more matches to see player stats.' : 'No completed matches in this period.'}</p>
    </main>
  </>;
  return <StatsView key={id} match={records[0].match} points={stats.contexts.map((context) => context.point)} controls={controls}
    nameA={player.name} nameB="Opponents (combined)" back={back} contexts={stats.contexts}
    aggregate={`${stats.matches} completed ${stats.matches === 1 ? 'match' : 'matches'} · ${stats.wins} wins · ${stats.losses} losses${stats.undecided ? ` · ${stats.undecided} completed without a recorded winner` : ''}`} />;
}
