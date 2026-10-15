import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import Header from '../components/Header';
import ClubPicker from '../components/ClubPicker';
import { api, type SessionUser } from '../../storage/session';
import { syncNow } from '../../storage/sync';
import { useAllPlayers, useClubs } from '../hooks';
import { useUser } from '../user';
import { navigate } from '../router';
import { GENDERS, isPlayerEmail, type Club, type Gender, type Player, type UserRole } from '../../model/types';

const NEW_SYSTEM_PLAYER = '__new_system_player__';

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

function AccountFields({ role, setRole, playerId, setPlayerId, clubIds, setClubIds, players, clubs, userId, ownAccount, newPlayerFields }: {
  role: UserRole; setRole: (role: UserRole) => void;
  playerId: string; setPlayerId: (id: string) => void;
  clubIds: string[]; setClubIds: (ids: string[]) => void;
  players: Player[]; clubs: Club[]; userId?: string; ownAccount?: boolean;
  newPlayerFields?: ReactNode;
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
        {newPlayerFields && <option value={NEW_SYSTEM_PLAYER}>New system player...</option>}
        {players.filter((player) => !player.ownerId && (!player.linkedUserId || player.linkedUserId === userId))
          .map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
      </select>
    </label>
    {playerId === NEW_SYSTEM_PLAYER && newPlayerFields}
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
  const [playerName, setPlayerName] = useState('');
  const [playerGender, setPlayerGender] = useState<Gender | ''>('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [clubIds, setClubIds] = useState<string[]>([]);
  const load = useCallback(async () => {
    setError('');
    try { setUsers(await fetchUsers()); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>, onSuccess?: () => void) {
    setError('');
    setBusy(true);
    try { await action(); await syncNow(); await load(); onSuccess?.(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (email.trim() && !isPlayerEmail(email.trim())) throw new Error('Enter a valid email address, or leave it blank.');
      const newPlayer = playerId === NEW_SYSTEM_PLAYER;
      if (newPlayer && (!playerName.trim() || !playerGender)) throw new Error('Player name and gender are required.');
      if (newPlayer && playerEmail.trim() && !isPlayerEmail(playerEmail.trim())) throw new Error('Enter a valid player email address, or leave it blank.');
      await api('/api/users', 'POST', {
        username: username.trim(), name: name.trim(), email: email.trim(), password, role, clubIds,
        ...(newPlayer
          ? { newPlayer: { name: playerName.trim(), gender: playerGender, email: playerEmail.trim() } }
          : { playerId: playerId || null }),
      });
      setUsername(''); setPassword(''); setRole('user'); setPlayerId(''); setClubIds([]);
      setName(''); setEmail('');
      setPlayerName(''); setPlayerGender(''); setPlayerEmail('');
    }, () => navigate('/users'));
  }
  if (id === 'new') {
    return <>
      <Header title="New user" back="/users" />
      <main className="page">
        <p className="muted">Online only. Coaches can have clubs without a player profile.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <form className="form" onSubmit={create}>
          <fieldset className="form" disabled={busy}>
            <label>Username<input autoComplete="off" autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Name (optional)<input value={name} maxLength={200} autoComplete="name" onChange={(event) => setName(event.target.value)} /></label>
            <label>Email (optional)<input type="email" value={email} maxLength={254} autoComplete="email" onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Initial password (min 8 characters)
              <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <AccountFields role={role} setRole={setRole} playerId={playerId} setPlayerId={setPlayerId}
              clubIds={clubIds} setClubIds={setClubIds} players={players} clubs={clubs}
              newPlayerFields={<div className="form">
                <h2>New system player</h2>
                <label>Player name *<input value={playerName} maxLength={200} required
                  onChange={(event) => setPlayerName(event.target.value)} /></label>
                <label>Player gender *<select value={playerGender} required onChange={(event) => setPlayerGender(event.target.value as Gender | '')}>
                  <option value="">Select gender</option>
                  {GENDERS.map((gender) => <option key={gender.value} value={gender.value}>{gender.label}</option>)}
                </select></label>
                <label>Player email (optional)<input type="email" value={playerEmail} maxLength={254}
                  onChange={(event) => setPlayerEmail(event.target.value)} /></label>
              </div>} />
            <button className="btn btn-primary" disabled={!username.trim() || password.length < 8 || (role === 'user' && !playerId)
              || (playerId === NEW_SYSTEM_PLAYER && (!playerName.trim() || !playerGender))}>Create user</button>
          </fieldset>
        </form>
      </main>
    </>;
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
    <Header title="Users" back="/settings" action={
      <a href="#/users/new" aria-label="New user" title="New user"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44 }}>
        <Plus size={24} aria-hidden="true" />
      </a>
    } />
    <main className="page">
      <div className="form">
        <label>Search users<input type="search" value={search} autoComplete="off" aria-describedby="user-search-hint"
          placeholder="Username, full name or email" onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <p className="muted" id="user-search-hint" aria-live="polite">
        {searching && users !== null ? `${matches.length} matching ${matches.length === 1 ? 'user' : 'users'}.`
          : 'Type at least 3 characters to search by username, full name or email. Until then, all users are shown.'}
      </p>
      <p className="muted">Online only. Coaches can have clubs without a player profile.</p>
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
    </main>
  </>;
}
