import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { DEFAULT_RULES } from '../../model/rules';
import type { Match, Player } from '../../model/types';
import type { SessionUser } from '../../storage/session';
import { canViewPlayerStats, UserContext } from '../user';
import HomePage from './HomePage';
import AnalysisPage from './AnalysisPage';
import MatchStatsPage, { statsMatchGroups } from './MatchStatsPage';
import StatsPlayersPage, { statsPlayersForUser } from './StatsPlayersPage';
import App from '../App';

const state = vi.hoisted(() => ({
  players: undefined as Player[] | undefined, live: undefined as unknown, liveResults: [] as unknown[],
  user: undefined as SessionUser | undefined, segments: [] as string[], returnTo: '',
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => state.liveResults.length ? state.liveResults.shift() : state.live }));
vi.mock('../router', () => ({
  useRoute: () => ({ segments: state.segments, query: new URLSearchParams(state.returnTo ? { return: state.returnTo } : {}) }),
  navigate: vi.fn(),
}));
vi.mock('../hooks', () => ({
  useAllPlayers: () => state.players,
  useClubs: () => [{ id: 'north', name: 'North Club' }],
  usePlayerNames: () => new Map((state.players ?? []).map((player) => [player.id, player.name])),
  usePendingCount: () => 0,
  useSyncState: () => ({ status: 'idle' }),
  useSession: () => {
    if (!state.user) throw new Error('Test account not set.');
    return { token: 'test-session', user: state.user };
  },
}));

const actor = (role: SessionUser['role'] = 'user'): SessionUser => ({
  id: 'viewer', username: 'viewer', role, playerId: 'alice', clubIds: ['north'],
});
const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({
  id, name, createdAt: 1, updatedAt: 1, ...extra,
});
const match = (id: string, ownerId?: string, updatedAt = 1): Match => ({
  id, ownerId, ownerName: ownerId, playerAId: 'alice', playerBId: 'bob', status: 'completed',
  rules: DEFAULT_RULES, ruleSetId: 'standard', ruleSetName: 'Standard', updatedAt,
});
const render = (node: ReactNode, user = actor()) => renderToStaticMarkup(<UserContext value={user}>{node}</UserContext>);

beforeEach(() => {
  state.live = undefined;
  state.liveResults = [];
  state.user = actor();
  state.segments = [];
  state.returnTo = '';
  state.players = [
    player('alice', 'Alice', { clubIds: ['north'] }),
    player('bob', 'bob', { clubIds: ['south'] }),
    player('multi', 'Zara', { clubIds: ['north', 'south'] }),
    player('unassigned', 'Unassigned'),
    player('private', 'Private', { ownerId: 'viewer', clubIds: ['north'] }),
    player('reference', 'Reference', { referenceOnly: true, clubIds: ['north'] }),
    player('deleted', 'Deleted', { deletedAt: 2, clubIds: ['north'] }),
  ];
});

describe('analytics route wiring', () => {
  it('routes from the hub to a separate match directory', () => {
    state.segments = ['stats'];
    expect(renderToStaticMarkup(<App />)).toContain('Stats &amp; Analysis');
    state.segments = ['stats', 'matches'];
    state.live = [];
    expect(renderToStaticMarkup(<App />)).toContain('My matches');
  });

  it('routes users to linked player stats and coach/admin accounts to their selectors', () => {
    state.segments = ['stats', 'players'];
    state.live = { player: state.players?.[0], records: [] };
    const user = renderToStaticMarkup(<App />);
    expect(user).toContain('Last 3 matches');
    expect(user).not.toContain('Search System Players');
    for (const role of ['coach', 'admin'] as const) {
      state.user = actor(role);
      expect(renderToStaticMarkup(<App />)).toContain('Search System Players');
    }
  });

  it('routes chosen players to stats with the correct back destination, preserving profile aliases', () => {
    state.live = { player: state.players?.[0], records: [] };
    state.user = actor('coach');
    state.segments = ['stats', 'players', 'alice'];
    expect(renderToStaticMarkup(<App />)).toContain('href="#/stats/players"');
    state.user = actor();
    expect(renderToStaticMarkup(<App />)).toContain('href="#/stats"');
    state.segments = ['players', 'alice', 'stats'];
    expect(renderToStaticMarkup(<App />)).toContain('href="#/players/alice"');
  });

  it('returns match details to the stats directory, but ignores unsafe return URLs', () => {
    state.segments = ['match', 'shared', 'stats'];
    state.returnTo = '/stats/matches';
    state.liveResults = [match('shared', 'other'), []];
    expect(renderToStaticMarkup(<App />)).toContain('href="#/stats/matches"');
    state.returnTo = 'https://example.invalid';
    state.liveResults = [match('shared', 'other'), []];
    expect(renderToStaticMarkup(<App />)).toContain('href="#/match/shared"');
  });
});

describe('Stats & Analysis entry points', () => {
  it('adds the home button without removing the recording and management buttons', () => {
    state.live = 0;
    const html = render(<HomePage />);
    expect(html).toContain('href="#/stats"');
    expect(html).toContain('Stats &amp; Analysis');
    expect(html).toContain('href="#/match"');
    expect(html).toContain('href="#/players"');
    expect(html).toContain('href="#/rules"');
  });

  it('provides two separate navigation choices for all roles', () => {
    for (const role of ['user', 'coach', 'admin'] as const) {
      const html = render(<AnalysisPage />, actor(role));
      expect(html).toContain('href="#/stats/matches">Match stats');
      expect(html).toContain('href="#/stats/players">Player stats');
      expect(html).toContain('System Players only');
    }
  });
});

describe('match stats directory', () => {
  it('groups by creator, not admin edit permissions, and sorts each group newest first', () => {
    const records = [match('shared', 'other', 30), match('own', 'viewer', 10), match('local', undefined, 20),
      { ...match('deleted', 'viewer', 40), deletedAt: 50 }];
    for (const role of ['user', 'coach', 'admin'] as const) {
      const groups = statsMatchGroups(records, actor(role));
      expect(groups.own.map((record) => record.id)).toEqual(['local', 'own']);
      expect(groups.shared.map((record) => record.id)).toEqual(['shared']);
    }
    expect(records.map((record) => record.id)).toEqual(['shared', 'own', 'local', 'deleted']);
  });

  it('lists every status, puts own matches before shared matches and links directly to stats with a return path', () => {
    state.live = [
      { ...match('shared', 'other', 30), status: 'abandoned' },
      { ...match('own', 'viewer', 10), status: 'scheduled' },
      { ...match('progress', 'viewer', 20), status: 'in_progress' },
    ];
    const html = render(<MatchStatsPage />);
    expect(html.indexOf('stats?return=%2Fstats%2Fmatches">')).toBeGreaterThan(html.indexOf('My matches'));
    expect(html.indexOf('/own/stats')).toBeLessThan(html.indexOf('/shared/stats'));
    expect(html).toContain('Shared with me');
    expect(html).toContain('scheduled');
    expect(html).toContain('in progress');
    expect(html).toContain('abandoned');
    expect(html).not.toContain('Delete');
    expect(html).not.toContain('Finalise');
  });

  it('distinguishes club/admin access from explicit user sharing and handles loading and empty lists', () => {
    expect(render(<MatchStatsPage />)).toContain('Loading matches...');
    state.live = [];
    expect(render(<MatchStatsPage />)).toContain('No matches created by you');
    expect(render(<MatchStatsPage />, actor('coach'))).toContain('Shared / club matches');
    expect(render(<MatchStatsPage />, actor('admin'))).toContain('Other users&#x27; matches');
  });
});

describe('System Player selection', () => {
  it('allows only the linked System Player for a normal user', () => {
    expect(statsPlayersForUser(state.players ?? [], actor()).map((p) => p.id)).toEqual(['alice']);
    expect(canViewPlayerStats({ ...actor(), playerId: 'private' }, player('private', 'Same Name', { ownerId: 'viewer' }))).toBe(false);
    expect(statsPlayersForUser(state.players ?? [], { ...actor(), playerId: undefined })).toEqual([]);
  });

  it('allows coaches only their club System Players, including multi-club players', () => {
    expect(statsPlayersForUser(state.players ?? [], actor('coach')).map((p) => p.id)).toEqual(['alice', 'multi']);
    expect(statsPlayersForUser(state.players ?? [], { ...actor('coach'), clubIds: [] })).toEqual([]);
  });

  it('lets admins search any System Player but excludes private, reference-only and deleted profiles', () => {
    expect(statsPlayersForUser(state.players ?? [], actor('admin')).map((p) => p.id)).toEqual(['alice', 'bob', 'unassigned', 'multi']);
    expect(statsPlayersForUser(state.players ?? [], actor('admin'), '  ALI  ').map((p) => p.id)).toEqual(['alice']);
    expect(statsPlayersForUser(state.players ?? [], actor('admin'), 'b').map((p) => p.id)).toEqual(['bob']);
  });

  it('takes users directly to linked stats and explains missing links without offering other players', () => {
    const linked = render(<StatsPlayersPage />);
    expect(linked).toContain('Loading player stats...');
    expect(linked).not.toContain('Search System Players');
    const missing = render(<StatsPlayersPage />, { ...actor(), playerId: undefined });
    expect(missing).toContain('Ask an administrator');
    expect(missing).not.toContain('href="#/stats/players/alice"');
  });

  it('renders coach/admin search and selection links with the proper scope', () => {
    const coach = render(<StatsPlayersPage />, actor('coach'));
    expect(coach).toContain('Search System Players');
    expect(coach).toContain('href="#/stats/players/alice"');
    expect(coach).toContain('North Club');
    expect(coach).not.toContain('href="#/stats/players/bob"');
    const admin = render(<StatsPlayersPage />, actor('admin'));
    expect(admin).toContain('href="#/stats/players/bob"');
    expect(admin).not.toContain('href="#/stats/players/private"');
    expect(admin).not.toContain('href="#/stats/players/reference"');
  });
});
