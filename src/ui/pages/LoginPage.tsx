import { useState, type FormEvent } from 'react';
import { login } from '../../storage/session';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) return setError('You need to be online to log in.');
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password, (n) =>
        confirm(`This device has ${n} unsynced change(s) from another account. Logging in discards them. Continue?`),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <div className="home-title">
        <img src="/logo.svg" alt="" width={72} height={72} />
        <h1>Sheen Tennis Tracker</h1>
      </div>
      <form className="form" onSubmit={submit}>
        <label>
          Username
          <input autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-big" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
