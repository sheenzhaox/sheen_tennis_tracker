import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, isLive, matchesForPlayer, pointsForMatch } from '../../storage/db';
import { playerStats } from '../../stats/playerStats';
import { canSelectPlayer, useUser } from '../user';
import { StatsView } from './StatsPage';

export default function PlayerStatsPage({ id }: { id: string }) {
  const user = useUser();
  const data = useLiveQuery(async () => {
    const player = await db.players.get(id);
    if (!isLive(player) || !canSelectPlayer(user, player)) return null;
    const matches = await matchesForPlayer(id);
    const records = await Promise.all(matches.map(async (match) => ({ match, points: await pointsForMatch(match.id) })));
    return { player, records, stats: playerStats(id, records) };
  }, [id, user]);
  if (data === undefined) return null;
  const back = `/players/${id}`;
  if (!data || data.records.length === 0) return <>
    <Header title="Player stats" back={back} />
    <main className="page"><p>{data ? 'No visible matches recorded for this player yet.' : 'Player not found.'}</p></main>
  </>;
  const { player, records, stats } = data;
  return <StatsView key={id} match={records[0].match} points={stats.contexts.map((context) => context.point)}
    nameA={player.name} nameB="Opponents (combined)" back={back} contexts={stats.contexts}
    aggregate={`${stats.matches} visible matches · ${stats.wins} wins · ${stats.losses} losses${stats.undecided ? ` · ${stats.undecided} completed without a recorded winner` : ''}`} />;
}
