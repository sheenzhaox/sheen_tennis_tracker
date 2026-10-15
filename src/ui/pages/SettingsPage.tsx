import { useState, type FormEvent } from 'react';
import Header from '../components/Header';
import { syncNow, type SyncState } from '../../storage/sync';
import { api, logout } from '../../storage/session';
import { usePendingCount, useSyncState } from '../hooks';
import { formatDate } from '../format';
import { isAdmin, useUser } from '../user';

export function describeSync(s: SyncState, pending: number): string {
  switch (s.status) {
    case 'signed-out':
      return 'Signed out - log in again to sync';
    case 'offline':
      return `Offline - ${pending} change(s) waiting`;
    case 'syncing':
      return 'Syncing...';
    case 'error':
      return `Sync error: ${s.message ?? 'unknown'}`;
    default:
      return s.lastSyncedAt
        ? `Synced ${formatDate(s.lastSyncedAt)}${pending ? ` - ${pending} pending` : ''}`
        : `${pending} change(s) waiting`;
  }
}

export default function SettingsPage() {
  const user = useUser();
  const sync = useSyncState();
  const pending = usePendingCount();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/password', 'POST', { current, next });
      setCurrent('');
      setNext('');
      setMessage({ ok: true, text: 'Password changed. Other devices were signed out.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function signOut() {
    const warn = pending
      ? `${pending} change(s) haven't synced yet and will be lost. Log out anyway?`
      : 'Log out? Match data on this device will be removed (it stays in the cloud).';
    if (confirm(warn)) await logout();
  }

  return (
    <>
      <Header title="Settings" back="/" />
      <main className="page">
        <h2>Account</h2>
        <p>
          Logged in as <strong>{user.username}</strong> <span className="muted">({user.role})</span>
        </p>
        {isAdmin(user) && (
          <div className="form">
            <a className="btn" href="#/users">Manage users</a>
            <a className="btn" href="#/clubs">Manage clubs</a>
          </div>
        )}

        <h2>Cloud sync</h2>
        <p>{describeSync(sync, pending)}</p>
        <button className="btn" type="button" onClick={() => void syncNow()}>
          Sync now
        </button>

        <h2>Change password</h2>
        <form className="form" onSubmit={changePassword}>
          <label>
            Current password
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label>
            New password (min 8 characters)
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          {message && <p className={message.ok ? 'muted' : 'error'}>{message.text}</p>}
          <button className="btn btn-primary" type="submit" disabled={!current || next.length < 8}>
            Change password
          </button>
        </form>

        <h2>Log out</h2>
        <button className="btn btn-danger" type="button" onClick={() => void signOut()}>
          Log out
        </button>
      </main>
    </>
  );
}
