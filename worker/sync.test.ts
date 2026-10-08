import { describe, expect, it } from 'vitest';
import { canWriteMatch, canWritePlayer } from './sync';
import type { User } from './http';

const admin = { id: 'admin', username: 'admin', role: 'admin' } as User;
const alice = { id: 'alice', username: 'alice', role: 'user' } as User;
const live = { deletedAt: null };
const deleted = { deletedAt: 1 };

describe('canWriteMatch', () => {
  it('allows users to save and delete their own matches, including unsynced matches', () => {
    for (const record of [live, deleted]) {
      expect(canWriteMatch(alice, record, undefined)).toBe(true);
      expect(canWriteMatch(alice, record, { owner_id: 'alice', deleted_at: null })).toBe(true);
    }
  });

  it('rejects edits and deletes of matches belonging to another user, even if shared', () => {
    for (const record of [live, deleted]) {
      expect(canWriteMatch(alice, record, { owner_id: 'bob', deleted_at: null })).toBe(false);
      expect(canWriteMatch(alice, record, { owner_id: null, deleted_at: null })).toBe(false);
    }
  });

  it('allows repeated tombstones but does not let a user resurrect a deleted match', () => {
    const server = { owner_id: 'alice', deleted_at: 1 };
    expect(canWriteMatch(alice, deleted, server)).toBe(true);
    expect(canWriteMatch(alice, live, server)).toBe(false);
  });

  it('preserves admin match management', () => {
    expect(canWriteMatch(admin, deleted, { owner_id: 'alice', deleted_at: null })).toBe(true);
  });
});

describe('canWritePlayer', () => {
  it('lets users add new players but not create already-deleted ones', () => {
    expect(canWritePlayer(alice, live, undefined, false)).toBe(true);
    expect(canWritePlayer(alice, deleted, undefined, false)).toBe(false);
  });

  it('lets users edit and delete only their own players', () => {
    const own = { owner_id: 'alice', deleted_at: null };
    expect(canWritePlayer(alice, live, own, false)).toBe(true);
    expect(canWritePlayer(alice, deleted, own, false)).toBe(true);
    expect(canWritePlayer(alice, live, { owner_id: 'bob', deleted_at: null }, false)).toBe(false);
    expect(canWritePlayer(alice, deleted, { owner_id: 'bob', deleted_at: null }, false)).toBe(false);
  });

  it('keeps admin-added (shared) players read-only for users', () => {
    const shared = { owner_id: null, deleted_at: null };
    expect(canWritePlayer(alice, live, shared, false)).toBe(false);
    expect(canWritePlayer(alice, deleted, shared, false)).toBe(false);
  });

  it('blocks deleting a player used in a match and reviving a deleted player', () => {
    expect(canWritePlayer(alice, deleted, { owner_id: 'alice', deleted_at: null }, true)).toBe(false);
    expect(canWritePlayer(alice, live, { owner_id: 'alice', deleted_at: 5 }, false)).toBe(false);
  });

  it('lets admins write any player', () => {
    expect(canWritePlayer(admin, live, { owner_id: null, deleted_at: null }, false)).toBe(true);
    expect(canWritePlayer(admin, deleted, undefined, false)).toBe(true);
  });
});
