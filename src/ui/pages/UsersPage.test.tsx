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

  it('has an accessible search field above the directory and includes name/email when creating accounts', () => {
    const html = renderToStaticMarkup(<UserContext value={users[2]}><UsersPage /></UserContext>);
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-describedby="user-search-hint"');
    expect(html.indexOf('Search users')).toBeLessThan(html.indexOf('New user'));
    expect(html).toContain('Name (optional)');
    expect(html).toContain('Email (optional)');
    expect(html).toContain('type="email"');
    expect(html).not.toContain('Reset password');
  });
});
