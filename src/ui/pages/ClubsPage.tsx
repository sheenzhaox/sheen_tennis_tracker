import { useState, type FormEvent } from 'react';
import Header from '../components/Header';
import { useAllPlayers, useClubs } from '../hooks';
import { api } from '../../storage/session';
import { syncNow } from '../../storage/sync';
import type { Club } from '../../model/types';

export default function ClubsPage() {
  const clubs = useClubs();
  const players = useAllPlayers();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api('/api/clubs', 'POST', { name: name.trim() });
      setName('');
    });
  }

  function rename(club: Club) {
    const next = prompt('Club name:', club.name);
    if (next !== null) void run(() => api(`/api/clubs/${club.id}`, 'PATCH', { name: next.trim() }));
  }

  function remove(club: Club) {
    if (confirm(`Delete ${club.name}? Coaches will lose access granted by this club.`)) {
      void run(() => api(`/api/clubs/${club.id}`, 'DELETE'));
    }
  }

  return <>
    <Header title="Clubs" back="/settings" />
    <main className="page">
      <p className="muted">Club management requires an internet connection. Names must be unique.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="list">
        {(clubs ?? []).map((club) => {
          const members = players?.filter((player) => player.clubIds?.includes(club.id));
          return <li className="user-row" key={club.id}>
            <section className="club-section" aria-labelledby={`club-${club.id}`}>
              <h2 id={`club-${club.id}`}>{club.name}</h2>
              <div className="user-actions">
                <button className="btn" disabled={busy} onClick={() => rename(club)}>Rename</button>
                <button className="btn btn-danger" disabled={busy} onClick={() => remove(club)}>Delete</button>
              </div>
              <details className="club-players">
                <summary>Players{members ? ` (${members.length})` : ''}</summary>
                {members === undefined ? <p className="muted" role="status">Loading players...</p>
                  : members.length === 0 ? <p className="muted">No players linked to this club.</p>
                    : <ul className="list" aria-label={`${club.name} players`}>
                      {members.map((player) => <li key={player.id}>
                        <a href={`#/players/${encodeURIComponent(player.id)}?return=%2Fclubs`}>{player.name}</a>
                      </li>)}
                    </ul>}
              </details>
            </section>
          </li>;
        })}
      </ul>
      <h2>New club</h2>
      <form className="form" onSubmit={create}>
        <label>Name *<input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Add club</button>
      </form>
    </main>
  </>;
}
