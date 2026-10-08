import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Player } from '../../model/types';
import type { SessionUser } from '../../storage/session';
import { canDeletePlayer, canEditPlayer, canSelectPlayer, isListedPlayer, isClubPlayer, UserContext } from '../user';
import PlayerPicker, { playerSuggestions } from './PlayerPicker';

const user: SessionUser = { id: 'alice', username: 'alice', role: 'user' };
const admin: SessionUser = { id: 'admin', username: 'admin', role: 'admin' };
const players: Player[] = [
  { id: 'own', name: 'Jane Smith', ownerId: user.id, createdAt: 1, updatedAt: 1 },
  { id: 'shared', name: 'John Smith', createdAt: 1, updatedAt: 1 },
  { id: 'other', name: 'Private Smith', ownerId: 'bob', createdAt: 1, updatedAt: 1 },
  { id: 'deleted', name: 'Deleted Smith', ownerId: user.id, createdAt: 1, updatedAt: 1, deletedAt: 2 },
];

describe('player management and match suggestions', () => {
  it('lists only manageable players, but searches own and admin-added players', () => {
    const livePlayers = players.filter((p) => !p.deletedAt);
    expect(livePlayers.filter((p) => isListedPlayer(user, p)).map((p) => p.id)).toEqual(['own']);
    expect(livePlayers.filter((p) => isListedPlayer(admin, p)).map((p) => p.id)).toEqual(['own', 'shared', 'other']);
    for (const account of [user, admin]) {
      for (const player of players) {
        expect(isListedPlayer(account, player)).toBe(canEditPlayer(account, player));
      }
    }
    expect(playerSuggestions(players.filter((p) => canSelectPlayer(user, p)), 'smi').map((p) => p.id))
      .toEqual(['own', 'shared']);
    expect(playerSuggestions(players.filter((p) => canSelectPlayer(admin, p)), 'smi').map((p) => p.id))
      .toEqual(['own', 'shared', 'other']);
  });

  it('requires three trimmed characters and matches case-insensitive substrings anywhere', () => {
    for (const query of ['', 's', 'sm', '  sm  ']) expect(playerSuggestions(players, query)).toEqual([]);
    expect(playerSuggestions(players, '  SMi  ').map((p) => p.id)).toEqual(['own', 'shared', 'other']);
    expect(playerSuggestions(players, 'ane').map((p) => p.id)).toEqual(['own']);
    expect(playerSuggestions(players, 'Jane Smith').map((p) => p.id)).toEqual(['own']);
    expect(playerSuggestions(players, 'Nobody')).toEqual([]);
  });

  it('preserves selected names and uses a labelled text combobox instead of a dropdown', () => {
    const html = renderToStaticMarkup(
      <UserContext value={user}>
        <PlayerPicker label="Player A" value="own" onChange={() => {}} players={players} otherId="shared" loading={false} />
      </UserContext>,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('value="Jane Smith"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('Add new player');
  });

  it('disables input while players are loading rather than offering premature quick-add', () => {
    const html = renderToStaticMarkup(
      <UserContext value={user}>
        <PlayerPicker label="Player B" value="" onChange={() => {}} players={[]} otherId="" loading />
      </UserContext>,
    );
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Add new player');
  });

  it('lets users edit but not delete their linked system player', () => {
    const linked = { ...players[1], linkedUserId: user.id };
    expect(canEditPlayer(user, linked)).toBe(true);
    expect(isListedPlayer(user, linked)).toBe(true);
    expect(canDeletePlayer(user, linked)).toBe(false);
  });

  it('lists club players for coaches, not private players merely carrying a club ID', () => {
    const coach: SessionUser = { ...user, role: 'coach', clubIds: ['one', 'two'] };
    const system = { ...players[1], clubIds: ['two'] };
    expect(isClubPlayer(coach, system)).toBe(true);
    expect(isListedPlayer(coach, system)).toBe(true);
    expect(canEditPlayer(coach, system)).toBe(false);
    expect(isClubPlayer(coach, { ...system, ownerId: 'bob' })).toBe(false);
    expect(isClubPlayer(coach, { ...system, clubIds: ['other'] })).toBe(false);
  });
});
