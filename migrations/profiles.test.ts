import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { VISIBLE_MATCHES } from '../worker/access';
import { canWriteMatch, canWritePlayer } from '../worker/sync';
import { createUser, listUsers } from '../worker/admin';
import type { Env, User } from '../worker/http';

const dir = join(process.cwd(), 'migrations');
const migrations = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
const profileMigration = migrations.indexOf('0007_clubs_and_profiles.sql');
let db: DatabaseSync;
function player(id: string, owner: string | null, data: object) {
  db.prepare('INSERT INTO players (id, owner_id, updated_at, synced_at, data) VALUES (?, ?, 10, 10, ?)')
    .run(id, owner, JSON.stringify({ id, name: id, ...data }));
}
function match(id: string, owner: string, a: string, b = 'private') {
  db.prepare('INSERT INTO matches (id, owner_id, updated_at, synced_at, data) VALUES (?, ?, 10, 10, ?)')
    .run(id, owner, JSON.stringify({ id, playerAId: a, playerBId: b }));
}
const visible = (user: string) => db.prepare(
  `SELECT id FROM matches WHERE id IN (${VISIBLE_MATCHES.replaceAll('?2', '$user')}) ORDER BY id`,
).all({ $user: user }).map((row) => row.id);

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of migrations.slice(0, profileMigration)) {
    db.exec('BEGIN'); db.exec(readFileSync(join(dir, file), 'utf8')); db.exec('COMMIT');
  }
  db.exec(`INSERT INTO users (id, username, role, created_at) VALUES
    ('alice', 'alice', 'user', 1), ('bob', 'bob', 'user', 1), ('coach', 'coach', 'user', 1);
    INSERT INTO sessions VALUES ('existing-session', 'alice', 1, 9999999999999);`);
  player('system', null, { club: 'Old Club', notes: 'Legacy admin observation' });
  player('private', 'alice', { club: 'Old Club', notes: 'Alice private observation', email: 'alice@example.com' });
  match('club-match', 'bob', 'system');
  match('private-match', 'bob', 'private', 'private');
  match('coach-own', 'coach', 'private', 'private');
  for (const file of migrations.slice(profileMigration)) {
    db.exec('BEGIN'); db.exec(readFileSync(join(dir, file), 'utf8')); db.exec('COMMIT');
  }
});
afterEach(() => db.close());

function accountEnvironment(): Env {
  const operations = new WeakMap<D1PreparedStatement, () => { meta: { changes: number } }>();
  const prepare = vi.fn((sql: string) => {
    let values: SQLInputValue[] = [];
    const query = () => {
      const prepared = db.prepare(sql.replace(/\?(\d+)/g, (_match, index: string) => `:param${index}`));
      prepared.setAllowUnknownNamedParameters(true);
      return prepared;
    };
    const parameters = () => Object.fromEntries(values.map((value, index) => [`param${index + 1}`, value]));
    const statement = {
      bind: vi.fn().mockImplementation((...bound: SQLInputValue[]) => { values = bound; return statement; }),
      first: vi.fn().mockImplementation(async () => query().get(parameters()) ?? null),
      all: vi.fn().mockImplementation(async () => ({ results: query().all(parameters()) })),
      run: vi.fn(), raw: vi.fn(),
    };
    operations.set(statement, () => ({ meta: { changes: Number(query().run(parameters()).changes) } }));
    return statement;
  });
  const batch = vi.fn().mockImplementation(async (statements: D1PreparedStatement[]) => {
    db.exec('BEGIN');
    try {
      const results = statements.map((statement) => {
        const execute = operations.get(statement);
        if (!execute) throw new Error('Unknown test statement');
        return execute();
      });
      db.exec('COMMIT');
      return results;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  return { DB: { prepare, batch, exec: vi.fn(), withSession: vi.fn(), dump: vi.fn() },
    ENVIRONMENT: 'test', ASSETS: { fetch: vi.fn(), connect: vi.fn() } };
}

describe('inline system player account creation', () => {
  const admin: User = { id: 'admin', username: 'admin', role: 'admin' };
  const request = (body: object) => new Request('https://example.com/api/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'new-account', password: 'fixture-password', ...body }),
  });
  const counts = () => ({
    users: db.prepare('SELECT COUNT(*) AS count FROM users').get()?.count,
    players: db.prepare('SELECT COUNT(*) AS count FROM players').get()?.count,
  });

  it.each(['user', 'coach', 'admin'])('creates a linked system player for a %s account', async (role) => {
    const env = accountEnvironment();
    const response = await createUser(request({ role, name: 'Account Name', email: 'account@example.com',
      newPlayer: { name: ' New Player ', gender: 'female', email: ' player@example.com ' } }), env, admin);
    expect(response.status).toBe(200);
    const result = await response.json() as { id: string; playerId: string };
    expect(db.prepare('SELECT player_id, name, email FROM users WHERE id = ?').get(result.id))
      .toMatchObject({ player_id: result.playerId, name: 'Account Name', email: 'account@example.com' });
    const row = db.prepare('SELECT owner_id, created_by, data, synced_at FROM players WHERE id = ?').get(result.playerId);
    expect(row).toMatchObject({ owner_id: null, created_by: admin.id });
    expect(Number(row?.synced_at)).toBeGreaterThan(0);
    expect(JSON.parse(String(row?.data))).toMatchObject({ id: result.playerId, name: 'New Player', gender: 'female', email: 'player@example.com' });
    expect(await (await listUsers(env)).json()).toMatchObject({ users: expect.arrayContaining([expect.objectContaining({ id: result.id, playerId: result.playerId })]) });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('does not leave an extra player when the username is already taken', async () => {
    const before = counts();
    const response = await createUser(request({ username: 'ALICE', newPlayer: { name: 'No orphan', gender: 'male' } }), accountEnvironment(), admin);
    expect(response.status).toBe(409);
    expect(counts()).toEqual(before);
  });

  it('creates only one player/account pair for concurrent duplicate submissions', async () => {
    const env = accountEnvironment();
    const responses = await Promise.all([1, 2].map(() => createUser(request({ newPlayer: { name: 'One player', gender: 'male' } }), env, admin)));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM players WHERE json_extract(data, '$.name') = 'One player'").get()?.count).toBe(1);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('rolls back the account when inserting its player fails', async () => {
    const before = counts();
    db.exec(`CREATE TRIGGER reject_inline_player BEFORE INSERT ON players
      WHEN json_extract(NEW.data, '$.name') = 'Blocked player'
      BEGIN SELECT RAISE(ABORT, 'test player insert failure'); END;`);
    await expect(createUser(request({ newPlayer: { name: 'Blocked player', gender: 'male' } }), accountEnvironment(), admin))
      .rejects.toThrow('test player insert failure');
    expect(counts()).toEqual(before);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('reuses an explicitly chosen existing system player without inserting another', async () => {
    const env = accountEnvironment();
    const before = counts().players;
    const response = await createUser(request({ playerId: 'system' }), env, admin);
    expect(response.status).toBe(200);
    expect(counts().players).toBe(before);
    expect((await createUser(request({ username: 'another-account', playerId: 'system' }), env, admin)).status).toBe(409);
  });
});

describe('club/profile migration and relational access', () => {
  it('adds optional account name/email without guessing them from linked or private player profiles', () => {
    expect(db.prepare('SELECT name, email FROM users WHERE id = ?').get('alice')).toMatchObject({ name: null, email: null });
    db.exec("UPDATE users SET name = 'Alice Example', email = 'account@example.com' WHERE id = 'alice'");
    expect(db.prepare('SELECT name, email FROM users WHERE id = ?').get('alice'))
      .toMatchObject({ name: 'Alice Example', email: 'account@example.com' });
    expect(db.prepare("SELECT json_extract(data, '$.email') AS email FROM players WHERE id = ?").get('private')?.email)
      .toBe('alice@example.com');
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n).toBe(1);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('preserves accounts, sessions, matches, and private notes without inventing gender or links', () => {
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM matches').get()?.n).toBe(3);
    expect(db.prepare('SELECT player_id FROM users WHERE id = ?').get('alice')?.player_id).toBeNull();
    const row = db.prepare('SELECT data FROM players WHERE id = ?').get('private');
    const data = JSON.parse(String(row?.data));
    expect(data.notes).toBeUndefined();
    expect(data.gender).toBeUndefined();
    expect(data.legacyClub).toBe('Old Club');
    expect(db.prepare('SELECT user_id, notes FROM player_notes WHERE player_id = ?').get('private'))
      .toMatchObject({ user_id: 'alice', notes: 'Alice private observation' });
    expect(db.prepare('SELECT user_id FROM player_notes WHERE player_id = ?').get('system')?.user_id).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM player_clubs WHERE player_id = ?').get('private')?.n).toBe(0);
  });

  it('enforces unique club names and one account per linked player', () => {
    expect(() => db.prepare("INSERT INTO clubs VALUES ('duplicate', 'old club', 1, NULL, 1, '{}')").run()).toThrow();
    db.exec("UPDATE users SET player_id = 'system' WHERE id = 'alice'");
    expect(() => db.exec("UPDATE users SET player_id = 'system' WHERE id = 'bob'")).toThrow();
  });

  it('grants coaches matches involving either side in any assigned club, never from private club text', () => {
    db.exec(`UPDATE users SET role = 'coach' WHERE id = 'coach';
      INSERT INTO clubs VALUES ('second', 'Second Club', 1, NULL, 1, '{}');
      INSERT INTO player_clubs VALUES ('system', 'second');
      INSERT INTO user_clubs VALUES ('coach', 'second');`);
    expect(visible('coach')).toEqual(['club-match', 'coach-own']);
    db.exec("INSERT INTO match_access VALUES ('club-match', 'coach', 20, 20)");
    expect(visible('coach')).toEqual(['club-match', 'coach-own']);
    db.exec("DELETE FROM user_clubs WHERE user_id = 'coach'");
    expect(visible('coach')).toEqual(['coach-own']);
    db.exec("INSERT INTO user_clubs SELECT 'coach', id FROM clubs WHERE name = 'Old Club'");
    expect(visible('coach')).toEqual(['club-match', 'coach-own']);
    db.exec("UPDATE clubs SET deleted_at = 20 WHERE name = 'Old Club'");
    expect(visible('coach')).toEqual(['coach-own']);
  });

  it('does not grant normal users other peoples matches merely from their linked profile', () => {
    db.exec("UPDATE users SET player_id = 'system' WHERE id = 'alice'");
    expect(visible('alice')).toEqual([]);
    db.exec("INSERT INTO match_access VALUES ('club-match', 'alice', NULL, 10)");
    expect(visible('alice')).toEqual(['club-match']);
  });

  it('keeps notes attached to their author after promotion', () => {
    db.exec("UPDATE players SET owner_id = NULL WHERE id = 'private'");
    expect(db.prepare('SELECT notes FROM player_notes WHERE player_id = ? AND user_id = ?').get('private', 'alice')?.notes)
      .toBe('Alice private observation');
    expect(db.prepare('SELECT notes FROM player_notes WHERE player_id = ? AND user_id = ?').get('private', 'bob')).toBeUndefined();
  });
});

describe('profile and coach editing permissions', () => {
  const coach: User = { id: 'coach', username: 'coach', role: 'coach' };
  it('allows linked system profile edits, but not deletion or other system profile edits', () => {
    expect(canWritePlayer(coach, { deletedAt: null }, { owner_id: null, deleted_at: null, linked_user_id: 'coach' }, false)).toBe(true);
    expect(canWritePlayer(coach, { deletedAt: 1 }, { owner_id: null, deleted_at: null, linked_user_id: 'coach' }, false)).toBe(false);
    expect(canWritePlayer(coach, { deletedAt: null }, { owner_id: null, deleted_at: null, linked_user_id: 'alice' }, false)).toBe(false);
  });
  it('does not allow coaches to edit club matches recorded by another user', () => {
    expect(canWriteMatch(coach, { deletedAt: null }, { owner_id: 'alice', deleted_at: null })).toBe(false);
    expect(canWriteMatch(coach, { deletedAt: 1 }, { owner_id: 'alice', deleted_at: null })).toBe(false);
    expect(canWriteMatch(coach, { deletedAt: null }, { owner_id: 'coach', deleted_at: null })).toBe(true);
  });
});
