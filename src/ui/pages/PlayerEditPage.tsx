import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, deleteRecord, isLive, matchesForPlayer, newId, saveRecord } from '../../storage/db';
import type { Backhand, Handedness, Player } from '../../model/types';
import { navigate } from '../router';
import { usePlayerNames } from '../hooks';
import { formatMatchDay } from '../format';
import { canEditPlayer, isAdmin, isListedPlayer, useUser } from '../user';

interface Props {
  id: string;
  returnTo: string | null;
}

export default function PlayerEditPage({ id, returnTo }: Props) {
  const user = useUser();
  const isNew = id === 'new';
  const player = useLiveQuery(
    async () => {
      if (isNew) return null;
      const p = await db.players.get(id);
      return isLive(p) && isListedPlayer(user, p) ? p : null;
    },
    [id, user.id],
  );

  if (!isNew && player === undefined) return null;
  if (!isNew && player === null) {
    return (
      <>
        <Header title="Player" back="/players" />
        <main className="page">
          <p>Player not found.</p>
        </main>
      </>
    );
  }
  return <PlayerForm key={id} player={player ?? null} returnTo={returnTo} />;
}

function PlayerForm({ player, returnTo }: { player: Player | null; returnTo: string | null }) {
  const user = useUser();
  const [name, setName] = useState(player?.name ?? '');
  const [handedness, setHandedness] = useState<Handedness | ''>(player?.handedness ?? '');
  const [backhand, setBackhand] = useState<Backhand | ''>(player?.backhand ?? '');
  const [rating, setRating] = useState(player?.rating ?? '');
  const [club, setClub] = useState(player?.club ?? '');
  const [notes, setNotes] = useState(player?.notes ?? '');
  const [error, setError] = useState('');
  const editable = !player || canEditPlayer(user, player);

  const matches = useLiveQuery(() => (player ? matchesForPlayer(player.id) : []), [player?.id]) ?? [];
  const names = usePlayerNames();
  const back = returnTo ?? '/players';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const trimmed = name.trim();
    if (!trimmed) return setError('Name is required.');
    const now = Date.now();
    const data: Player = {
      id: player?.id ?? newId(),
      name: trimmed,
      handedness: handedness || undefined,
      backhand: backhand || undefined,
      rating: rating.trim() || undefined,
      club: club.trim() || undefined,
      notes: notes.trim() || undefined,
      // The server assigns the owner; set it locally so a new private player is listed before it syncs.
      ownerId: player ? player.ownerId : isAdmin(user) ? undefined : user.id,
      createdAt: player?.createdAt ?? now,
      updatedAt: now,
    };
    await saveRecord('players', data);
    navigate(back);
  }

  async function remove() {
    if (!player || !editable) return;
    if (matches.length > 0) return setError('This player has recorded matches and cannot be deleted.');
    if (!confirm(`Delete ${player.name}?`)) return;
    await deleteRecord('players', player.id);
    navigate('/players');
  }

  return (
    <>
      <Header title={!player ? 'New player' : editable ? 'Edit player' : 'Player'} back={back} />
      <main className="page">
        <form className="form" onSubmit={save}>
          {!editable && <p className="muted">Shared player added by an admin (view only).</p>}
          <fieldset className="form" disabled={!editable}>
            <label>
              Name *
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!player} />
            </label>
            <label>
              Plays
              <select value={handedness} onChange={(e) => setHandedness(e.target.value as Handedness | '')}>
                <option value="">-</option>
                <option value="right">Right-handed</option>
                <option value="left">Left-handed</option>
              </select>
            </label>
            <label>
              Backhand
              <select value={backhand} onChange={(e) => setBackhand(e.target.value as Backhand | '')}>
                <option value="">-</option>
                <option value="one-handed">One-handed</option>
                <option value="two-handed">Two-handed</option>
              </select>
            </label>
            <label>
              Rating (optional, e.g. UTR / NTRP)
              <input value={rating} onChange={(e) => setRating(e.target.value)} />
            </label>
            <label>
              Club (optional)
              <input value={club} onChange={(e) => setClub(e.target.value)} />
            </label>
            <label>
              Notes (optional)
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </fieldset>
          {error && <p className="error">{error}</p>}
          {editable && (
            <button className="btn btn-primary" type="submit">
              Save
            </button>
          )}
          {player && editable && (
            <button className="btn btn-danger" type="button" onClick={remove}>
              Delete player
            </button>
          )}
        </form>

        {player && (
          <section>
            <h2>Matches ({matches.length})</h2>
            {matches.length === 0 ? (
              <p className="muted">No matches recorded yet.</p>
            ) : (
              <ul className="list">
                {matches.map((m) => {
                  const opponentId = m.playerAId === player.id ? m.playerBId : m.playerAId;
                  return (
                    <li key={m.id}>
                      <a href={`#/match/${m.id}`}>
                        <strong>vs {names.get(opponentId) ?? 'Unknown'}</strong>
                        <span className="muted">
                          {formatMatchDay(m)} · {m.status.replace('_', ' ')}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}
