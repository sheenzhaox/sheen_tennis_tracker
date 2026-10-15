import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import UsersPage, { userSearchResults, type AccountInfo } from './UsersPage';
import { UserContext } from '../user';

vi.mock('../../storage/session', () => ({ api: vi.fn() }));
vi.mock('../../storage/sync', () => ({ syncNow: vi.fn() }));
vi.mock('../hooks', () => ({ useAllPlayers: () => [], useClubs: () => [] }));

const users: AccountInfo[] = [
  { id: 'z', username: 'Zulu', role: 'coach', disabled: false, name: 'Jane Smith', email: 'coach@example.com' },
  { id: 'b', username: 'bob', role: 'user', disabled: true },
  { id: 'a', username: 'Alice', role: 'admin', disabled: false, name: 'Alice Johnson', email: 'alice@example.org' },
];

describe('user directory search', () => {
  it('shows every user alphabetically until three trimmed characters are typed', () => {
    for (const query of ['', 'b', 'bo', '  bo  ']) {
      expect(userSearchResults(users, query).map((user) => user.username)).toEqual(['Alice', 'bob', 'Zulu']);
    }
    expect(users.map((user) => user.username)).toEqual(['Zulu', 'bob', 'Alice']);
  });

  it('matches case-insensitive substrings in usernames, full names, or email addresses', () => {
    expect(userSearchResults(users, '  BOB  ').map((user) => user.id)).toEqual(['b']);
    expect(userSearchResults(users, 'SMI').map((user) => user.id)).toEqual(['z']);
    expect(userSearchResults(users, 'JOHNSON').map((user) => user.id)).toEqual(['a']);
    expect(userSearchResults(users, 'EXAMPLE').map((user) => user.id)).toEqual(['a', 'z']);
    expect(userSearchResults(users, 'example.org').map((user) => user.id)).toEqual(['a']);
    expect(userSearchResults(users, 'missing')).toEqual([]);
  });

  it('offers a header New user link above search without a creation form below the directory', () => {
    const html = renderToStaticMarkup(<UserContext value={users[2]}><UsersPage /></UserContext>);
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-describedby="user-search-hint"');
    expect(html).toContain('href="#/users/new" aria-label="New user" title="New user"');
    expect(html.indexOf('New user')).toBeLessThan(html.indexOf('Search users'));
    expect(html).not.toContain('Create user');
    expect(html).not.toContain('Initial password');
    expect(html).not.toContain('Reset password');
  });

  it('opens a dedicated creation screen with the existing fields and a return to Users', () => {
    const html = renderToStaticMarkup(<UserContext value={users[2]}><UsersPage id="new" /></UserContext>);
    expect(html).toContain('<h1>New user</h1>');
    expect(html).toContain('href="#/users" aria-label="Back"');
    expect(html).toContain('Name (optional)');
    expect(html).toContain('Email (optional)');
    expect(html).toContain('type="email"');
    expect(html).toContain('Initial password');
    expect(html).toContain('Linked system player');
    expect(html).toContain('<option value="__new_system_player__">New system player...</option>');
    expect(html).not.toContain('Player name *');
    expect(html).toContain('Create user');
    expect(html).not.toContain('Search users');
    expect(html).not.toContain('Reset password');
  });
});
