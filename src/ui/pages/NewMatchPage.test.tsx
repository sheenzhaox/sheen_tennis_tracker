import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Player } from '../../model/types';
import NewMatchPage, { resolveMatchPlayers } from './NewMatchPage';
import { UserContext } from '../user';

const store = vi.hoisted(() => ({ nextId: 0, saveRecord: vi.fn() }));
vi.mock('../../storage/db', () => ({
  db: { matches: {}, players: {}, transaction: vi.fn() },
  isLive: (row: unknown) => !!row, newId: () => `draft-${++store.nextId}`, saveRecord: store.saveRecord,
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => null }));
vi.mock('../hooks', () => ({ useAllPlayers: () => [], useAllRuleSets: () => [] }));

const players: Player[] = [
  { id: 'system', name: 'Sam', createdAt: 1, updatedAt: 1 },
  { id: 'other', name: 'Pat', createdAt: 1, updatedAt: 1 },
];
beforeEach(() => { store.nextId = 0; store.saveRecord.mockClear(); });

describe('match participant choices', () => {
  it('reuses existing records only for explicitly selected IDs', () => {
    const result = resolveMatchPlayers({ id: 'system', name: 'Sam' }, { id: 'other', name: 'Pat' }, players, 'alice');
    expect(result).toEqual({ playerAId: 'system', playerBId: 'other', newPlayers: [] });
  });

  it('creates new private records for unselected names even when an exact name already exists', () => {
    const result = resolveMatchPlayers({ id: '', name: '  Sam  ' }, { id: 'other', name: 'Pat' }, players, 'alice');
    expect(result.playerAId).not.toBe('system');
    expect(result.playerBId).toBe('other');
    expect(result.newPlayers).toMatchObject([{ id: result.playerAId, name: 'Sam', ownerId: 'alice' }]);
    expect(result.newPlayers[0].gender).toBeUndefined();
    expect(result.newPlayers[0].email).toBeUndefined();
    expect(store.saveRecord).not.toHaveBeenCalled();
  });

  it('accepts one-character names and distinct people with identical typed names', () => {
    const result = resolveMatchPlayers({ id: '', name: ' X ' }, { id: '', name: 'X' }, players, 'alice');
    expect(result.playerAId).not.toBe(result.playerBId);
    expect(result.newPlayers.map((player) => player.name)).toEqual(['X', 'X']);
  });

  it.each(['alice', 'coach', 'admin'])('makes every automatic player private to %s', (ownerId) => {
    const result = resolveMatchPlayers({ id: '', name: 'Sam' }, { id: '', name: 'Pat' }, players, ownerId);
    expect(result.newPlayers).toHaveLength(2);
    expect(result.newPlayers.every((player) => player.ownerId === ownerId)).toBe(true);
  });

  it('rejects invalid names, unavailable selections, and selecting the same player twice before any writes', () => {
    for (const choice of [{ id: '', name: '  ' }, { id: '', name: 'x'.repeat(201) }, { id: 'missing', name: 'Sam' }]) {
      expect(() => resolveMatchPlayers(choice, { id: 'other', name: 'Pat' }, players, 'alice')).toThrow();
    }
    expect(() => resolveMatchPlayers({ id: 'system', name: 'Sam' }, { id: 'system', name: 'Sam' }, players, 'alice')).toThrow('Players must be different.');
    expect(store.saveRecord).not.toHaveBeenCalled();
  });

  it('shows name entry without gender/email controls or an Add player button', () => {
    const html = renderToStaticMarkup(<UserContext value={{ id: 'admin', username: 'admin', role: 'admin' }}><NewMatchPage /></UserContext>);
    expect(html.match(/role="combobox"/g)).toHaveLength(2);
    expect(html).toContain('Otherwise, Next creates a new private player.');
    expect(html).not.toContain('new player gender');
    expect(html).not.toContain('new player email');
    expect(html).not.toContain('Add new player');
    expect(html).toContain('Next');
  });
});
