import Header from '../components/Header';
import { useClubs, usePlayers } from '../hooks';

export default function PlayersPage() {
  const players = usePlayers();
  const clubs = useClubs() ?? [];

  return (
    <>
      <Header title="Players" back="/" action={<a href="#/players/new">+ Add</a>} />
      <main className="page">
        {players === undefined ? null : players.length === 0 ? (
          <p className="muted">No players yet. Add yourself and your opponents.</p>
        ) : (
          <ul className="list">
            {players.map((p) => (
              <li key={p.id}>
                <a href={`#/players/${p.id}`}>
                  <strong>{p.name}</strong>
                  <span className="muted">
                    {[p.ownerId ? 'Private player' : 'System player', p.gender, p.rating,
                      clubs.filter((club) => p.clubIds?.includes(club.id)).map((club) => club.name).join(', ')].filter(Boolean).join(' · ')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
