import { useEffect, useState } from 'react';
import type { Player } from '../../model/types';
import { api } from '../../storage/session';
import { syncNow } from '../../storage/sync';
import { useClubs } from '../hooks';
import { fetchUsers, type AccountInfo } from '../pages/UsersPage';
import ClubPicker from './ClubPicker';

interface PrivateNote { userId: string | null; username: string | null; notes: string; updatedAt: number }

export default function PlayerManagement({ player }: { player: Player }) {
  const clubs = useClubs();
  const [users, setUsers] = useState<AccountInfo[]>([]);
  const [ownerId, setOwnerId] = useState(player.ownerId ?? '');
  const [clubIds, setClubIds] = useState(player.clubIds ?? []);
  const [notes, setNotes] = useState<PrivateNote[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!changed) { setOwnerId(player.ownerId ?? ''); setClubIds(player.clubIds ?? []); }
  }, [player.ownerId, player.clubIds, changed]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchUsers(), api<{ notes: PrivateNote[] }>(`/api/players/${player.id}/notes`)]).then(([accounts, data]) => {
      if (!cancelled) { setUsers(accounts); setNotes(data.notes); }
    }, (err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [player.id, player.notesUpdatedAt]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await syncNow();
      await action();
      setChanged(false);
      await syncNow();
      setNotes((await api<{ notes: PrivateNote[] }>(`/api/players/${player.id}/notes`)).notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  function editNote(note: PrivateNote) {
    const value = prompt(`Private note by ${note.username ?? 'legacy admin'}:`, note.notes);
    if (value !== null) void run(() => api(`/api/players/${player.id}/notes`, 'PATCH', { userId: note.userId, notes: value }));
  }

  return <section className="form">
    <h2>Admin: visibility and clubs</h2>
    <p className="muted">Online only. Making a player system-level never shares anyone's private notes.</p>
    <label>Visibility / owner
      <select value={ownerId} disabled={busy} onChange={(event) => {
        setOwnerId(event.target.value); setChanged(true); if (event.target.value) setClubIds([]);
      }}>
        <option value="">System-level player</option>
        {users.map((user) => <option key={user.id} value={user.id}>Private to {user.username}</option>)}
      </select>
    </label>
    {!ownerId && <ClubPicker clubs={clubs ?? []} value={clubIds} disabled={busy || clubs === undefined}
      onChange={(ids) => { setClubIds(ids); setChanged(true); }} />}
    <button className="btn" disabled={busy || !changed} type="button"
      onClick={() => void run(() => api(`/api/players/${player.id}/management`, 'PATCH', { ownerId: ownerId || null, clubIds }))}>
      Save visibility and clubs
    </button>
    {error && <p className="error" role="alert">{error}</p>}
    <h2>Admin: private notes</h2>
    {notes.filter((note) => note.notes).map((note) => <div key={note.userId ?? 'legacy'}>
      <strong>{note.username ?? 'Legacy admin note'}</strong>
      <p style={{ whiteSpace: 'pre-wrap' }}>{note.notes}</p>
      <button className="btn" type="button" disabled={busy} onClick={() => editNote(note)}>Edit private note</button>
    </div>)}
    {notes.every((note) => !note.notes) && <p className="muted">No private notes.</p>}
  </section>;
}
