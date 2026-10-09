import { useState } from 'react';
import Header from '../components/Header';
import { useAllPlayers, useClubs } from '../hooks';
import { canViewPlayerStats, useUser } from '../user';
import type { Player } from '../../model/types';
import type { SessionUser } from '../../storage/session';
import PlayerStatsPage from './PlayerStatsPage';

export function statsPlayersForUser(players: Player[], user: SessionUser, query = ''): Player[] {
  const search = query.trim().toLowerCase();
  return players.filter((player) => canViewPlayerStats(user, player) && player.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

export default function StatsPlayersPage() {
  const user = useUser();
  if (user.role !== 'user') return <PlayerDirectory />;
  if (user.playerId) return <PlayerStatsPage key={user.playerId} id={user.playerId} back="/stats" />;
  return <>
    <Header title="Player stats" back="/stats" />
    <main className="page"><p>Your account is not linked to a System Player. Ask an administrator to link your player profile.</p></main>
  </>;
}

function PlayerDirectory() {
  const user = useUser();
  const players = useAllPlayers();
  const clubs = useClubs() ?? [];
  const [search, setSearch] = useState('');
  const eligible = players === undefined ? undefined : statsPlayersForUser(players, user);
  const results = eligible === undefined ? undefined : statsPlayersForUser(eligible, user, search);
  return <>
    <Header title="Player stats" back="/stats" />
    <main className="page">
      <div className="form">
        <label>Search System Players
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      <p className="muted">{user.role === 'coach' ? 'Select a System Player from your assigned clubs.' : 'Select any System Player. Private players are not available for player stats.'}</p>
      {results === undefined ? <p role="status">Loading players...</p> : !eligible?.length ? <p className="muted">
        {user.role === 'coach' ? 'No System Players in your assigned clubs.' : 'No System Players available.'}
      </p> : !results.length ? <p className="muted">No matching System Players.</p> : <ul className="list user-directory">
        {results.map((player) => <li key={player.id}>
          <a href={`#/stats/players/${encodeURIComponent(player.id)}`}>
            <strong>{player.name}</strong>
            <span className="muted">{clubs.filter((club) => player.clubIds?.includes(club.id)).map((club) => club.name).join(', ') || 'System player'}</span>
          </a>
        </li>)}
      </ul>}
    </main>
  </>;
}
