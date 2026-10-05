import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Header from '../components/Header';
import { api } from '../../storage/session';
import { useUser } from '../user';

export interface AccountInfo {
  id: string;
  username: string;
  role: 'admin' | 'user';
  disabled: boolean;
}

export async function fetchUsers(): Promise<AccountInfo[]> {
  return (await api<{ users: AccountInfo[] }>('/api/users')).users;
}

export default function UsersPage() {
  const me = useUser();
  const [users, setUsers] = useState<AccountInfo[] | null>(null);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');

  const load = useCallback(() => {
    fetchUsers().then(setUsers, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function create(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api('/api/users', 'POST', { username: username.trim(), password, role });
      setUsername('');
      setPassword('');
      setRole('user');
    });
  }

  function resetPassword(u: AccountInfo) {
    const pw = prompt(`New password for ${u.username} (min 8 characters):`);
    if (pw) void run(() => api(`/api/users/${u.id}`, 'PATCH', { password: pw }));
  }

  return (
    <>
      <Header title="Users" back="/settings" />
      <main className="page">
        {error && <p className="error">{error}</p>}
        {users === null ? (
          !error && <p className="muted">Loading...</p>
        ) : (
          <ul className="list">
            {users.map((u) => (
              <li key={u.id} className="user-row">
                <div>
                  <strong>{u.username}</strong>
                  <span className="muted">
                    {' '}
                    {u.role}
                    {u.disabled ? ' · disabled' : ''}
                    {u.id === me.id ? ' · you' : ''}
                  </span>
                </div>
                <div className="user-actions">
                  <button type="button" className="btn" onClick={() => resetPassword(u)}>
                    Reset password
                  </button>
                  {u.id !== me.id && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void run(() => api(`/api/users/${u.id}`, 'PATCH', { role: u.role === 'admin' ? 'user' : 'admin' }))}
                      >
                        {u.role === 'admin' ? 'Make user' : 'Make admin'}
                      </button>
                      <button
                        type="button"
                        className={`btn ${u.disabled ? '' : 'btn-danger'}`}
                        onClick={() => void run(() => api(`/api/users/${u.id}`, 'PATCH', { disabled: !u.disabled }))}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2>New user</h2>
        <form className="form" onSubmit={create}>
          <label>
            Username
            <input autoComplete="off" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Initial password (min 8 characters)
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={!username.trim() || password.length < 8}>
            Create user
          </button>
        </form>
      </main>
    </>
  );
}
