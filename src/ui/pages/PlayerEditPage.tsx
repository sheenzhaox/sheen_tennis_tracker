import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, deleteRecord, isLive, matchesForPlayer, newId, savePlayerNote, saveRecord } from '../../storage/db';
import { GENDERS, isPlayerEmail, type Backhand, type Gender, type Handedness, type Player } from '../../model/types';
import { navigate } from '../router';
import { useClubs, usePlayerNames } from '../hooks';
import { formatMatchDay } from '../format';
import { canDeletePlayer, canEditPlayer, canSelectPlayer, isAdmin, useUser } from '../user';
import PlayerManagement from '../components/PlayerManagement';

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
      return isLive(p) && canSelectPlayer(user, p) ? p : null;
    },
    [id, user],
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
  const [gender, setGender] = useState<Gender | ''>(player?.gender ?? '');
  const [email, setEmail] = useState(player?.email ?? '');
  const [handedness, setHandedness] = useState<Handedness | ''>(player?.handedness ?? '');
  const [backhand, setBackhand] = useState<Backhand | ''>(player?.backhand ?? '');
  const [rating, setRating] = useState(player?.rating ?? '');
  const [notes, setNotes] = useState(player?.notes ?? '');
  const [notesTouched, setNotesTouched] = useState(false);
  const [error, setError] = useState('');
  const editable = !player || canEditPlayer(user, player);
  const [busy, setBusy] = useState(false);
  const clubs = useClubs() ?? [];

  useEffect(() => {
    if (!notesTouched) setNotes(player?.notes ?? '');
  }, [player?.notes, player?.notesUpdatedAt, notesTouched]);

  const matches = useLiveQuery(() => (player ? matchesForPlayer(player.id) : []), [player?.id]) ?? [];
  const names = usePlayerNames();
  const back = returnTo ?? '/players';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!editable && player) {
      setBusy(true);
      try { await savePlayerNote(player, notes); navigate(back); }
      catch (err) { setError(err instanceof Error ? err.message : String(err)); }
      finally { setBusy(false); }
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return setError('Name is required.');
    if (!gender) return setError('Gender is required.');
    if (email.trim() && !isPlayerEmail(email.trim())) return setError('Enter a valid email address or leave it blank.');
    const now = Date.now();
    const data: Player = {
      ...player,
      id: player?.id ?? newId(),
      name: trimmed,
      gender,
      email: email.trim() || undefined,
      handedness: handedness || undefined,
      backhand: backhand || undefined,
      rating: rating.trim() || undefined,
      notes,
      notesUpdatedAt: notesTouched || !player ? now : player.notesUpdatedAt ?? 0,
      notesOnly: false,
      // The server assigns the owner; set it locally so a new private player is listed before it syncs.
      ownerId: player ? player.ownerId : isAdmin(user) ? undefined : user.id,
      createdAt: player?.createdAt ?? now,
      updatedAt: now,
    };
    setBusy(true);
    try { await saveRecord('players', data); navigate(back); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!player || !canDeletePlayer(user, player) || busy) return;
    if (matches.length > 0) return setError('This player has recorded matches and cannot be deleted.');
    if (!confirm(`Delete ${player.name}?`)) return;
    setBusy(true);
    try { await deleteRecord('players', player.id); navigate('/players'); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Header title={!player ? 'New player' : editable ? 'Edit player' : 'Player'} back={back} />
      <main className="page">
        <form className="form" onSubmit={save}>
          {!editable && <p className="muted">Player profile is view only. Your private notes remain editable.</p>}
          <fieldset className="form" disabled={!editable || busy}>
            <label>
              Name *
              <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus={!player} />
            </label>
            <label>Gender *
              <select value={gender} onChange={(event) => setGender(event.target.value as Gender | '')}>
                <option value="">Select gender</option>
                {GENDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {editable && <label>Email (optional, recommended)
              <input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>}
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
          </fieldset>
          {player && <p className="muted">Clubs: {clubs.filter((club) => player.clubIds?.includes(club.id)).map((club) => club.name).join(', ') || 'None assigned'}</p>}
          {player?.legacyClub && <p className="muted">Previous club (not a membership): {player.legacyClub}</p>}
          <label>Notes (only seen by you)
            <textarea rows={3} maxLength={20_000} disabled={busy} value={notes}
              onChange={(event) => { setNotes(event.target.value); setNotesTouched(true); }} />
          </label>
          <p className="muted">Private to your account; admins may also view them. Notes stay private if the player becomes system-level.</p>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {editable ? 'Save' : 'Save private notes'}
          </button>
          {player && canDeletePlayer(user, player) && (
            <button className="btn btn-danger" type="button" onClick={remove} disabled={busy}>
              Delete player
            </button>
          )}
        </form>
        {player && isAdmin(user) && <PlayerManagement player={player} />}

        {player && (
          <section>
            <h2>Matches ({matches.length})</h2>
            <a className="btn" href={`#/players/${player.id}/stats`}>Player stats</a>
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
