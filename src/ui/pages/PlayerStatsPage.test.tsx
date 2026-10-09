import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RULES } from '../../model/rules';
import type { Match, Player, Point } from '../../model/types';
import { db, matchesForPlayer, pointsForMatch } from '../../storage/db';
import { playerStats } from '../../stats/playerStats';
import { summary } from '../../stats/matchStats';
import { UserContext } from '../user';
import PlayerStatsPage, { completedPlayerMatches, PlayerStatsControls, selectPlayerMatches } from './PlayerStatsPage';

const state = vi.hoisted(() => ({ data: undefined as unknown, query: undefined as (() => unknown) | undefined }));
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (query: () => unknown) => { state.query = query; return state.data; },
}));
vi.mock('../hooks', () => ({ usePlayerNames: () => new Map([['opponent', 'Opponent']]) }));
vi.mock('../../storage/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../storage/db')>(),
  matchesForPlayer: vi.fn(),
  pointsForMatch: vi.fn(),
}));

const player: Player = { id: 'player', name: 'Linked Player', createdAt: 1, updatedAt: 1 };
const user = { id: 'user', username: 'user', role: 'user' as const, playerId: player.id };
const match = (id: string, date = '2026-10-09', extra: Partial<Match> = {}): Match => ({
  id, date, playerAId: player.id, playerBId: 'opponent', ruleSetId: 'standard', ruleSetName: 'Standard',
  rules: DEFAULT_RULES, status: 'completed', updatedAt: 1, ...extra,
});
const now = new Date(2026, 9, 9, 13).getTime();
const render = () => renderToStaticMarkup(<UserContext value={user}><PlayerStatsPage id={player.id} back="/stats" /></UserContext>);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(matchesForPlayer).mockReset();
  vi.mocked(pointsForMatch).mockReset();
  state.data = undefined;
  state.query = undefined;
});

describe('completed player-match filtering', () => {
  it('excludes scheduled, in-progress, abandoned, deleted and unrelated matches, but retains manual finalisations', () => {
    const records = [
      match('manual', '2026-10-08', { finalisation: { winner: 'A', reason: 'remaining_unrecorded' } }),
      match('last'), match('scheduled', undefined, { status: 'scheduled' }),
      match('progress', undefined, { status: 'in_progress' }), match('abandoned', undefined, { status: 'abandoned' }),
      match('deleted', undefined, { deletedAt: 5 }), match('other', undefined, { playerAId: 'other' }),
    ];
    expect(completedPlayerMatches(records, player.id).map((m) => m.id)).toEqual(['last', 'manual']);
    expect(records[0].id).toBe('manual');
  });

  it('chooses exactly the last match or up to the last three by actual match day, not entry date', () => {
    const records = [match('old', '2026-09-01', { startedAt: now }), match('new', '2026-10-09'),
      match('third', '2026-10-07'), match('second', '2026-10-08')];
    expect(selectPlayerMatches(records, player.id, 'last').map((m) => m.id)).toEqual(['new']);
    expect(selectPlayerMatches(records, player.id, 'last3').map((m) => m.id)).toEqual(['new', 'second', 'third']);
    expect(selectPlayerMatches(records.slice(0, 2), player.id, 'last3')).toHaveLength(2);
  });

  it('uses rolling calendar-month boundaries inclusively and excludes future match days', () => {
    const records = [match('today'), match('one-start', '2026-09-09'), match('one-before', '2026-09-08'),
      match('six-start', '2026-04-09'), match('six-before', '2026-04-08'), match('future', '2026-10-10')];
    expect(selectPlayerMatches(records, player.id, 'month', [], now).map((m) => m.id)).toEqual(['today', 'one-start']);
    expect(selectPlayerMatches(records, player.id, 'sixMonths', [], now).map((m) => m.id))
      .toEqual(['today', 'one-start', 'one-before', 'six-start']);
  });

  it.each([
    [2026, 2, 31, 'month', '2026-02-28', '2026-02-27'],
    [2024, 2, 31, 'month', '2024-02-29', '2024-02-28'],
    [2026, 7, 31, 'sixMonths', '2026-02-28', '2026-02-27'],
  ] as const)('clamps missing month days without rolling into the next month (%s/%s)', (year, month, day, period, boundary, before) => {
    const records = [match('boundary', boundary), match('before', before)];
    expect(selectPlayerMatches(records, player.id, period, [], new Date(year, month, day, 12).getTime()).map((m) => m.id)).toEqual(['boundary']);
  });

  it('falls back to recorded timestamps for legacy matches without an explicit match day', () => {
    const records = [match('created', undefined, { date: undefined, createdAt: new Date(2026, 8, 9).getTime() }),
      match('started', undefined, { date: undefined, startedAt: now }),
      match('old', undefined, { date: undefined, createdAt: new Date(2026, 8, 8).getTime(), updatedAt: now })];
    expect(selectPlayerMatches(records, player.id, 'month', [], now).map((m) => m.id)).toEqual(['started', 'created']);
  });

  it('custom selection includes only selected live completed IDs, never treats empty selection as all', () => {
    const records = [match('chosen'), match('not-chosen'), match('deleted', undefined, { deletedAt: 1 })];
    expect(selectPlayerMatches(records, player.id, 'custom', ['chosen', 'chosen', 'missing', 'deleted']).map((m) => m.id)).toEqual(['chosen']);
    expect(selectPlayerMatches(records, player.id, 'custom')).toEqual([]);
  });

  it('aggregates only selected matches and preserves normalization of the player on either side', () => {
    const a = match('a'), b = match('b', '2026-10-08', { playerAId: 'opponent', playerBId: player.id,
      finalisation: { winner: 'B', reason: 'player_a_retired' } });
    const point: Point = { id: 'ace', matchId: b.id, seq: 0, server: 'B', winner: 'B', end: 'ace',
      serves: [{ result: 'ace', location: 'wide', type: 'flat' }], createdAt: 1, updatedAt: 1 };
    const selected = selectPlayerMatches([a, b], player.id, 'custom', [b.id]);
    const stats = playerStats(player.id, selected.map((m) => ({ match: m, points: m.id === b.id ? [point] : [] })));
    expect(stats.matches).toBe(1);
    expect(stats.wins).toBe(1);
    expect(summary(stats.contexts).A.winners.aces).toBe(1);
  });
});

describe('player stats presentation and access', () => {
  it('shows all five period choices and retains them when there are no completed matches', () => {
    state.data = { player, records: [] };
    const html = render();
    for (const label of ['Last match', 'Last 3 matches', 'Within a month', 'Last 6 months', 'Customize']) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="true">Last match');
    expect(html).toContain('No completed matches visible to your account');
    expect(html).toContain('href="#/stats"');
  });

  it('renders custom checkboxes, selected values and select-all/clear controls', () => {
    const html = renderToStaticMarkup(<PlayerStatsControls player={player} matches={[match('a'), match('b')]}
      names={new Map([['opponent', 'Opponent']])} period="custom" customIds={['b']}
      onPeriodChange={() => {}} onCustomChange={() => {}} />);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain('Select all');
    expect(html).toContain('Clear selection');
    expect(html).toContain('vs Opponent');
  });

  it('defaults to last match and shows completed-only combined stats without exposing sharing controls', () => {
    state.data = { player, records: [{ match: match('new'), points: [] }, { match: match('old', '2026-10-08'), points: [] }] };
    const html = render();
    expect(html).toContain('1 completed match');
    expect(html).toContain('selected completed matches');
    expect(html).not.toContain('scheduled and partial');
    expect(html).not.toContain('Create link');
  });

  it('rejects private or unrelated System Players before fetching any matches or points', async () => {
    for (const candidate of [{ ...player, ownerId: user.id }, { ...player, id: 'unlinked-system' }]) {
      vi.spyOn(db.players, 'get').mockResolvedValue(candidate);
      render();
      if (!state.query) throw new Error('Player stats query not registered.');
      expect(await state.query()).toBeNull();
      expect(matchesForPlayer).not.toHaveBeenCalled();
      expect(pointsForMatch).not.toHaveBeenCalled();
    }
  });

  it('queries recorded points only for completed matches of the allowed System Player', async () => {
    vi.spyOn(db.players, 'get').mockResolvedValue(player);
    vi.mocked(matchesForPlayer).mockResolvedValue([match('done'), match('partial', undefined, { status: 'in_progress' })]);
    vi.mocked(pointsForMatch).mockResolvedValue([]);
    render();
    if (!state.query) throw new Error('Player stats query not registered.');
    expect(await state.query()).toMatchObject({ player, records: [{ match: { id: 'done' }, points: [] }] });
    expect(pointsForMatch).toHaveBeenCalledExactlyOnceWith('done');
  });
});
