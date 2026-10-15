import { useEffect, useState } from 'react';
import { api } from '../../storage/session';
import type { Match } from '../../model/types';
import { fetchUsers, type AccountInfo } from '../pages/UsersPage';

/** Admin: choose which users (besides the owner) can view a match. */
export default function MatchAccess({ match }: { match: Match }) {
  const [users, setUsers] = useState<AccountInfo[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([fetchUsers(), api<{ userIds: string[] }>(`/api/matches/${match.id}/access`)]).then(
      ([u, access]) => {
        setUsers(u);
        setSelected(access.userIds);
      },
      (e: Error) => setMessage(e.message),
    );
  }, [match.id]);

  async function save() {
    setMessage('');
    try {
      const res = await api<{ userIds: string[] }>(`/api/matches/${match.id}/access`, 'PUT', { userIds: selected });
      setSelected(res.userIds);
      setMessage('Saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  const others = users?.filter((u) => u.id !== match.ownerId) ?? [];
  return (
    <section>
      <h2>Shared with</h2>
      <p className="muted small">Recorded by {match.ownerName ?? 'this device (not synced yet)'}. Selected users can view this match.</p>
      {users && (
        <div className="chips">
          {others.map((u) => {
            const on = selected.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                onClick={() => setSelected(on ? selected.filter((id) => id !== u.id) : [...selected, u.id])}
              >
                {u.username}
              </button>
            );
          })}
        </div>
      )}
      {message && <p className="muted small">{message}</p>}
      {users && (
        <button className="btn" type="button" onClick={() => void save()}>
          Save sharing
        </button>
      )}
    </section>
  );
}
