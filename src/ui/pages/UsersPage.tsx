import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Header from '../components/Header';
import ClubPicker from '../components/ClubPicker';
import { api } from '../../storage/session';
import { syncNow } from '../../storage/sync';
import { useAllPlayers, useClubs } from '../hooks';
import { useUser } from '../user';
import type { Club, Player, UserRole } from '../../model/types';

export interface AccountInfo {
  id: string;
  username: string;
  role: UserRole;
  disabled: boolean;
  playerId?: string;
  clubIds?: string[];
}

export async function fetchUsers(): Promise<AccountInfo[]> {
  return (await api<{ users: AccountInfo[] }>('/api/users')).users;
}

function AccountFields({ role, setRole, playerId, setPlayerId, clubIds, setClubIds, players, clubs, userId, ownAccount }: {
  role: UserRole; setRole: (role: UserRole) => void;
  playerId: string; setPlayerId: (id: string) => void;
  clubIds: string[]; setClubIds: (ids: string[]) => void;
  players: Player[]; clubs: Club[]; userId?: string; ownAccount?: boolean;
}) {
  return <>
    <label>Role
      <select value={role} disabled={ownAccount} onChange={(event) => setRole(event.target.value as UserRole)}>
        <option value="user">User</option><option value="coach">Coach</option><option value="admin">Admin</option>
      </select>
    </label>
    <label>Linked system player {role === 'user' ? '*' : '(optional)'}
      <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
        <option value="">Not linked</option>
        {players.filter((player) => !player.ownerId && (!player.linkedUserId || player.linkedUserId === userId))
          .map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
      </select>
    </label>
    {role === 'coach' && <ClubPicker clubs={clubs} value={clubIds} onChange={setClubIds} />}
  </>;
}

function AccountEditor({ account, me, players, clubs, busy, run }: {
  account: AccountInfo; me: string; players: Player[]; clubs: Club[]; busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [role, setRole] = useState(account.role);
  const [playerId, setPlayerId] = useState(account.playerId ?? '');
  const [clubIds, setClubIds] = useState(account.clubIds ?? []);
  function save(event: FormEvent) {
    event.preventDefault();
    void run(() => api(`/api/users/${account.id}`, 'PATCH', { role, playerId: playerId || null, clubIds }));
  }
  function resetPassword() {
    const password = prompt(`New password for ${account.username} (min 8 characters):`);
    if (password) void run(() => api(`/api/users/${account.id}`, 'PATCH', { password }));
  }
  return <li>
    <form className="form" onSubmit={save}>
      <strong>{account.username}{account.id === me ? ' · you' : ''}{account.disabled ? ' · disabled' : ''}</strong>
      <fieldset className="form" disabled={busy}>
        <AccountFields role={role} setRole={setRole} playerId={playerId} setPlayerId={setPlayerId}
          clubIds={clubIds} setClubIds={setClubIds} players={players} clubs={clubs} userId={account.id} ownAccount={account.id === me} />
        {!account.playerId && account.role === 'user' && <p className="muted">Legacy account: assign a system player. Existing matches remain available.</p>}
        <div className="user-actions">
          <button className="btn" disabled={role === 'user' && !playerId}>Save account</button>
          <button className="btn" type="button" onClick={resetPassword}>Reset password</button>
          {account.id !== me && <button className={`btn ${account.disabled ? '' : 'btn-danger'}`} type="button"
            onClick={() => void run(() => api(`/api/users/${account.id}`, 'PATCH', { disabled: !account.disabled }))}>
            {account.disabled ? 'Enable' : 'Disable'}
          </button>}
        </div>
      </fieldset>
    </form>
  </li>;
}

export default function UsersPage() {
  const me = useUser();
  const players = useAllPlayers() ?? [];
  const clubs = useClubs() ?? [];
  const [users, setUsers] = useState<AccountInfo[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [playerId, setPlayerId] = useState('');
  const [clubIds, setClubIds] = useState<string[]>([]);
  const load = useCallback(async () => {
    try { setUsers(await fetchUsers()); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try { await action(); await syncNow(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api('/api/users', 'POST', { username: username.trim(), password, role, playerId: playerId || null, clubIds });
      setUsername(''); setPassword(''); setRole('user'); setPlayerId(''); setClubIds([]);
    });
  }
  return <>
    <Header title="Users" back="/settings" />
    <main className="page">
      <p className="muted">Online only. Create system-level players before linking user accounts. Coaches can have clubs without a player profile.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {users === null ? (!error && <p className="muted">Loading...</p>) : <ul className="list">
        {users.map((account) => <AccountEditor key={`${account.id}:${account.role}:${account.playerId}:${account.clubIds?.join(',')}`}
          account={account} me={me.id} players={players} clubs={clubs} busy={busy} run={run} />)}
      </ul>}
      <h2>New user</h2>
      <form className="form" onSubmit={create}>
        <fieldset className="form" disabled={busy}>
          <label>Username<input autoComplete="off" autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Initial password (min 8 characters)
            <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <AccountFields role={role} setRole={setRole} playerId={playerId} setPlayerId={setPlayerId}
            clubIds={clubIds} setClubIds={setClubIds} players={players} clubs={clubs} />
          <button className="btn btn-primary" disabled={!username.trim() || password.length < 8 || (role === 'user' && !playerId)}>Create user</button>
        </fieldset>
      </form>
    </main>
  </>;
}
