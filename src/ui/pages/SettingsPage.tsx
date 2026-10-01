import { useEffect, useState, type FormEvent } from 'react';
import Header from '../components/Header';
import { getToken, setToken, syncNow, type SyncState } from '../../storage/sync';
import { usePendingCount, useSyncState } from '../hooks';
import { formatDate } from '../format';

export function describeSync(s: SyncState, pending: number): string {
  switch (s.status) {
    case 'no-token':
      return 'Sync off - set your sync token';
    case 'unauthorized':
      return 'Sync token rejected - check settings';
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
  const sync = useSyncState();
  const pending = usePendingCount();
  const [token, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    void getToken().then((t) => setHasToken(!!t));
  }, [sync.status]);

  async function save(e: FormEvent) {
    e.preventDefault();
    await setToken(token.trim());
    setTokenInput('');
  }

  return (
    <>
      <Header title="Settings" back="/" />
      <main className="page">
        <h2>Cloud sync</h2>
        <p>{describeSync(sync, pending)}</p>
        <form className="form" onSubmit={save}>
          <label>
            Sync token {hasToken && <span className="muted">(saved on this device)</span>}
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={hasToken ? 'Enter a new token to replace' : 'Paste your sync token'}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!token.trim()}>
            Save token
          </button>
          <button className="btn" type="button" onClick={() => void syncNow()} disabled={!hasToken}>
            Sync now
          </button>
          {hasToken && (
            <button className="btn btn-danger" type="button" onClick={() => void setToken('')}>
              Remove token from this device
            </button>
          )}
        </form>
      </main>
    </>
  );
}
