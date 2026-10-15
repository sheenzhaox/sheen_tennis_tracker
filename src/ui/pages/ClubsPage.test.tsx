import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Club, Player } from '../../model/types';
import ClubsPage from './ClubsPage';

const state = vi.hoisted(() => {
  const data: { clubs: Club[]; players: Player[] | undefined } = { clubs: [], players: undefined };
  return data;
});
vi.mock('../hooks', () => ({ useClubs: () => state.clubs, useAllPlayers: () => state.players }));
vi.mock('../../storage/session', () => ({ api: vi.fn() }));
vi.mock('../../storage/sync', () => ({ syncNow: vi.fn() }));

beforeEach(() => {
  state.clubs = [
    { id: 'north', name: 'North Club', createdAt: 1, updatedAt: 1 },
    { id: 'south', name: 'South Club', createdAt: 1, updatedAt: 1 },
  ];
  state.players = [
    { id: 'alice', name: 'Alice', clubIds: ['north'], createdAt: 1, updatedAt: 1 },
    { id: 'bob', name: 'Bob', clubIds: ['south'], createdAt: 1, updatedAt: 1 },
    { id: 'both', name: 'Both Clubs', clubIds: ['north', 'south'], createdAt: 1, updatedAt: 1 },
    { id: 'private', name: 'Private Legacy Player', ownerId: 'user', legacyClub: 'North Club', createdAt: 1, updatedAt: 1 },
    { id: 'unlinked', name: 'Unlinked Player', createdAt: 1, updatedAt: 1 },
  ];
});
const section = (html: string, id: string) => html.split(`aria-labelledby="club-${id}">`)[1]?.split('</section>')[0] ?? '';

describe('club player directory', () => {
  it('starts each player list folded with its count in a native expandable summary', () => {
    const html = renderToStaticMarkup(<ClubsPage />);
    expect(html.match(/<details class="club-players">/g)).toHaveLength(2);
    expect(html.match(/<summary>Players \(2\)<\/summary>/g)).toHaveLength(2);
    expect(html).not.toMatch(/<details\b[^>]*\bopen\b/);
    for (const id of ['north', 'south']) {
      const club = section(html, id);
      const details = club.split('<details class="club-players">')[1]?.split('</details>')[0];
      expect(details).toContain('Both Clubs');
      expect(details).toContain('?return=%2Fclubs');
      expect(club.indexOf('Rename')).toBeLessThan(club.indexOf('<details'));
    }
  });

  it('lists all explicit members under the correct club, including multi-club players', () => {
    const html = renderToStaticMarkup(<ClubsPage />);
    const north = section(html, 'north');
    const south = section(html, 'south');
    expect(north).toContain('Alice');
    expect(north).not.toContain('>Bob<');
    expect(south).toContain('>Bob<');
    expect(south).not.toContain('Alice');
    for (const club of [north, south]) {
      expect(club).toContain('Both Clubs');
      expect(club).toContain('Players (2)');
      expect(club).toContain('Rename');
      expect(club).toContain('Delete');
    }
    expect(html).not.toContain('Private Legacy Player');
    expect(html).not.toContain('Unlinked Player');
    expect(html).toContain('New club');
  });

  it('links player names to the existing profile editor with a return to Clubs', () => {
    const html = renderToStaticMarkup(<ClubsPage />);
    expect(html).toContain('href="#/players/alice?return=%2Fclubs"');
    expect(html.match(/href="#\/players\/both\?return=%2Fclubs"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="North Club players"');
  });

  it('distinguishes unloaded players from a genuinely empty club', () => {
    state.players = undefined;
    const loading = renderToStaticMarkup(<ClubsPage />);
    expect(loading).toContain('Loading players...');
    expect(loading).not.toContain('No players linked');
    state.players = [];
    const empty = renderToStaticMarkup(<ClubsPage />);
    expect(empty).toContain('No players linked to this club.');
    expect(empty).toContain('Players (0)');
    expect(empty).not.toContain('Loading players...');
  });

  it('updates the displayed memberships and names when the live hooks refresh', () => {
    state.players = [{ id: 'alice', name: 'Renamed Alice', clubIds: ['south'], createdAt: 1, updatedAt: 2 }];
    const html = renderToStaticMarkup(<ClubsPage />);
    expect(section(html, 'north')).toContain('No players linked');
    expect(section(html, 'south')).toContain('Renamed Alice');
    expect(section(html, 'south')).toContain('Players (1)');
  });
});
