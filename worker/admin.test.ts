import { describe, expect, it, vi } from 'vitest';
import { createUser, listUsers, updateUser } from './admin';
import { accountData, type AccountRow } from './access';
import type { Env, User } from './http';

const admin: User = { id: 'admin', username: 'admin', role: 'admin' };
const request = (body: object) => new Request('https://example.com/api/users', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
function setup() {
  const first = vi.fn().mockResolvedValue({ role: 'user', player_id: null });
  const all = vi.fn().mockResolvedValue({ results: [] });
  const bind = vi.fn();
  const statement = { bind, first, all, run: vi.fn(), raw: vi.fn() };
  bind.mockReturnValue(statement);
  const prepare = vi.fn().mockReturnValue(statement);
  const batch = vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]);
  const env: Env = {
    DB: { prepare, batch, exec: vi.fn(), withSession: vi.fn(), dump: vi.fn() },
    ENVIRONMENT: 'test', ASSETS: { fetch: vi.fn(), connect: vi.fn() },
  };
  return { env, first, all, bind, prepare, batch };
}

describe('account name and email', () => {
  it('creates accounts with trimmed, independent profile fields', async () => {
    const { env, bind, prepare } = setup();
    const response = await createUser(request({
      username: 'new-admin', password: 'test-password', role: 'admin',
      name: '  Full Name  ', email: '  account@example.com  ',
    }), env);
    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('player_id, name, email'));
    expect(bind).toHaveBeenCalledWith(expect.any(String), 'new-admin', 'admin',
      expect.stringMatching(/^pbkdf2\$/), expect.any(Number), null, 'Full Name', 'account@example.com');
  });

  it('keeps name/email optional for existing clients creating accounts', async () => {
    const { env, bind } = setup();
    expect((await createUser(request({ username: 'new-coach', password: 'test-password', role: 'coach' }), env)).status).toBe(200);
    expect(bind).toHaveBeenCalledWith(expect.any(String), 'new-coach', 'coach',
      expect.any(String), expect.any(Number), null, null, null);
  });

  it('edits metadata on a legacy unlinked user without forcing a profile link or resetting passwords/sessions', async () => {
    const { env, bind, prepare } = setup();
    expect((await updateUser(request({ name: '  Legacy User  ', email: ' legacy@example.com ' }), env, admin, 'legacy')).status).toBe(200);
    expect(bind).toHaveBeenCalledWith('legacy', 'Legacy User');
    expect(bind).toHaveBeenCalledWith('legacy', 'legacy@example.com');
    const queries = prepare.mock.calls.map(([sql]) => sql);
    expect(queries.some((sql) => sql.includes('UPDATE players') || sql.includes('DELETE FROM sessions') || sql.includes('UPDATE users SET player_id'))).toBe(false);
  });

  it('allows clearing profile fields while leaving omitted fields unchanged', async () => {
    const { env, bind, prepare } = setup();
    expect((await updateUser(request({ name: null, email: '  ' }), env, admin, 'legacy')).status).toBe(200);
    expect(bind.mock.calls.filter((args) => args[0] === 'legacy' && args[1] === null)).toHaveLength(2);
    prepare.mockClear();
    expect((await updateUser(request({ name: 'Name only' }), env, admin, 'legacy')).status).toBe(200);
    expect(prepare.mock.calls.some(([sql]) => sql.includes('UPDATE users SET email'))).toBe(false);
  });

  it.each([
    { name: 'x'.repeat(201) }, { name: 123 }, { name: [] },
    { email: 'not-an-email' }, { email: 123 }, { email: 'a'.repeat(243) + '@example.com' },
  ])('rejects invalid profile fields without any writes: %j', async (fields) => {
    for (const update of [false, true]) {
      const { env, batch } = setup();
      const response = update
        ? await updateUser(request(fields), env, admin, 'legacy')
        : await createUser(request({ username: 'new-admin', password: 'test-password', role: 'admin', ...fields }), env);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty('error');
      expect(batch).not.toHaveBeenCalled();
    }
  });

  it('includes profile fields in canonical account metadata and the admin directory', async () => {
    const row: AccountRow = { id: 'alice', username: 'alice', role: 'user', name: 'Alice Example',
      email: 'alice@example.com', player_id: null, club_ids: '[]' };
    expect(accountData(row)).toMatchObject({ name: 'Alice Example', email: 'alice@example.com' });
    expect(accountData({ ...row, name: null, email: null }).name).toBeUndefined();
    const { env, all, prepare } = setup();
    all.mockResolvedValue({ results: [{ ...row, disabled_at: null, created_at: 1 }] });
    const response = await listUsers(env);
    expect(await response.json()).toMatchObject({ users: [{ name: row.name, email: row.email, disabled: false }] });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('ORDER BY u.username'));
  });

  it('preserves protections against disabling or demoting the signed-in admin', async () => {
    for (const fields of [{ name: 'Admin', disabled: true }, { email: 'admin@example.com', role: 'coach' }]) {
      const { env, batch } = setup();
      expect((await updateUser(request(fields), env, admin, admin.id)).status).toBe(400);
      expect(batch).not.toHaveBeenCalled();
    }
  });
});
