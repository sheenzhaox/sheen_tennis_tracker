import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Header from '../components/Header';
import ClubPicker from '../components/ClubPicker';
import { api, type SessionUser } from '../../storage/session';
import { syncNow } from '../../storage/sync';
import { useAllPlayers, useClubs } from '../hooks';
import { useUser } from '../user';
import { isPlayerEmail, type Club, type Player, type UserRole } from '../../model/types';

export interface AccountInfo extends SessionUser {
  disabled: boolean;
}

export async function fetchUsers(): Promise<AccountInfo[]> {
  return (await api<{ users: AccountInfo[] }>('/api/users')).users;
}

export function userSearchResults(users: AccountInfo[], query: string): AccountInfo[] {
  const needle = query.trim().toLowerCase();
  const matches = needle.length < 3 ? [...users] : users.filter((user) =>
    [user.username, user.name, user.email].some((value) => value?.toLowerCase().includes(needle)));
  return matches.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
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
  const [name, setName] = useState(account.name ?? '');
  const [email, setEmail] = useState(account.email ?? '');
  const [playerId, setPlayerId] = useState(account.playerId ?? '');
  const [clubIds, setClubIds] = useState(account.clubIds ?? []);
  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (email.trim() && !isPlayerEmail(email.trim())) throw new Error('Enter a valid email address, or leave it blank.');
      await api(`/api/users/${account.id}`, 'PATCH', {
        name: name.trim(), email: email.trim(), clubIds,
        ...(role !== account.role ? { role } : {}),
        ...(playerId !== (account.playerId ?? '') ? { playerId: playerId || null } : {}),
      });
    });
  }
  function resetPassword() {
    const password = prompt(`New password for ${account.username} (min 8 characters):`);
    if (password) void run(() => api(`/api/users/${account.id}`, 'PATCH', { password }));
  }
  return <form className="form" onSubmit={save}>
      <strong>{account.username}{account.id === me ? ' · you' : ''}{account.disabled ? ' · disabled' : ''}</strong>
      <fieldset className="form" disabled={busy}>
        <label>Username<input value={account.username} readOnly autoComplete="username" /></label>
        <label>Name (optional)<input value={name} maxLength={200} autoComplete="name"
          onChange={(event) => setName(event.target.value)} /></label>
        <label>Email (optional)<input type="email" value={email} maxLength={254} autoComplete="email"
          onChange={(event) => setEmail(event.target.value)} /></label>
        <AccountFields role={role} setRole={setRole} playerId={playerId} setPlayerId={setPlayerId}
          clubIds={clubIds} setClubIds={setClubIds} players={players} clubs={clubs} userId={account.id} ownAccount={account.id === me} />
        {!account.playerId && account.role === 'user' && <p className="muted">Legacy account: assign a system player. Existing matches remain available.</p>}
        <div className="user-actions">
          <button className="btn" disabled={role === 'user' && !playerId && (account.role !== 'user' || !!account.playerId)}>Save account</button>
          <button className="btn" type="button" onClick={resetPassword}>Reset password</button>
          {account.id !== me && <button className={`btn ${account.disabled ? '' : 'btn-danger'}`} type="button"
            onClick={() => void run(() => api(`/api/users/${account.id}`, 'PATCH', { disabled: !account.disabled }))}>
            {account.disabled ? 'Enable' : 'Disable'}
          </button>}
        </div>
      </fieldset>
    </form>;
}

export default function UsersPage({ id }: { id?: string }) {
  const me = useUser();
  const players = useAllPlayers() ?? [];
  const clubs = useClubs() ?? [];
  const [users, setUsers] = useState<AccountInfo[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [playerId, setPlayerId] = useState('');
  const [clubIds, setClubIds] = useState<string[]>([]);
  const load = useCallback(async () => {
    setError('');
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
      if (email.trim() && !isPlayerEmail(email.trim())) throw new Error('Enter a valid email address, or leave it blank.');
      await api('/api/users', 'POST', { username: username.trim(), name: name.trim(), email: email.trim(), password, role, playerId: playerId || null, clubIds });
      setUsername(''); setPassword(''); setRole('user'); setPlayerId(''); setClubIds([]);
      setName(''); setEmail('');
    });
  }
  if (id) {
    const account = users?.find((user) => user.id === id);
    return <>
      <Header title="User profile" back="/users" />
      <main className="page">
        <p className="muted">Online only. Name and email belong to this account, separately from its linked player. Username is used to log in.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {users === null ? (!error && <p className="muted" role="status">Loading...</p>) : account
          ? <AccountEditor key={JSON.stringify([account.id, account.role, account.playerId, account.clubIds, account.name, account.email])}
            account={account} me={me.id} players={players} clubs={clubs} busy={busy} run={run} />
          : <p role="status">User not found.</p>}
        {error && <button className="btn" onClick={() => void load()} disabled={busy}>Reload profile</button>}
      </main>
    </>;
  }
  const matches = userSearchResults(users ?? [], search);
  const searching = search.trim().length >= 3;
  return <>
    <Header title="Users" back="/settings" />
    <main className="page">
      <div className="form">
        <label>Search users<input type="search" value={search} autoComplete="off" aria-describedby="user-search-hint"
          placeholder="Username, full name or email" onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <p className="muted" id="user-search-hint" aria-live="polite">
        {searching && users !== null ? `${matches.length} matching ${matches.length === 1 ? 'user' : 'users'}.`
          : 'Type at least 3 characters to search by username, full name or email. Until then, all users are shown.'}
      </p>
      <p className="muted">Online only. Create system-level players before linking user accounts. Coaches can have clubs without a player profile.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {users === null ? (!error && <p className="muted" role="status">Loading...</p>) : matches.length > 0
        ? <ul className="list user-directory">
          {matches.map((account) => <li key={account.id}>
            <a href={`#/users/${encodeURIComponent(account.id)}`}>
              <strong>{account.username}{account.id === me.id ? ' · you' : ''}{account.disabled ? ' · disabled' : ''}</strong>
              {account.name && <span>{account.name}</span>}
              {account.email && <span className="muted">{account.email}</span>}
            </a>
          </li>)}
        </ul>
        : <p role="status">{searching ? 'No users match your search.' : 'No users found.'}</p>}
      {users === null && error && <button className="btn" onClick={() => void load()} disabled={busy}>Reload users</button>}
      <h2>New user</h2>
      <form className="form" onSubmit={create}>
        <fieldset className="form" disabled={busy}>
          <label>Username<input autoComplete="off" autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Name (optional)<input value={name} maxLength={200} autoComplete="name" onChange={(event) => setName(event.target.value)} /></label>
          <label>Email (optional)<input type="email" value={email} maxLength={254} autoComplete="email" onChange={(event) => setEmail(event.target.value)} /></label>
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
