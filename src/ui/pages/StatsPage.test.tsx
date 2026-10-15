import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RULES } from '../../model/rules';
import type { Match, Point, ShotType } from '../../model/types';
import RallyEntry from '../components/RallyEntry';
import OptionRow from '../components/OptionRow';
import { StatsView } from './StatsPage';
import { AdvancedAnalysisView } from './AdvancedAnalysisPage';

const match: Match = {
  id: 'match', playerAId: 'alice', playerBId: 'bob', ruleSetId: 'standard', ruleSetName: 'Standard',
  rules: DEFAULT_RULES, firstServer: 'A', status: 'in_progress', updatedAt: 1,
};
const point = (shotType: ShotType): Point => ({
  id: 'point', matchId: match.id, seq: 0, server: 'A', winner: 'A', end: 'rally',
  serves: [{ result: 'in', location: 'none', type: 'none' }],
  rally: { count: 3, ending: 'server_winner', stroke: 'forehand', direction: 'down_the_line', shotType, position: 'net' },
  createdAt: 1, updatedAt: 1,
});
const stats = (points: Point[]) => renderToStaticMarkup(
  <StatsView match={match} points={points} nameA="Alice" nameB="Bob" />,
);

describe('rally shot options and stats', () => {
  it('reuses the unchanged Summary in Advanced Analysis and adds the serve tables', () => {
    const rally = point('drive_volley');
    const points: Point[] = [rally, { ...rally, id: 'lucky', seq: 1, rally: { ...rally.rally!, lucky: true } },
      { ...rally, id: 'manual', seq: 2, end: 'unrecorded', serves: [], rally: undefined },
      { ...rally, id: 'double', seq: 3, end: 'double_fault', winner: 'B', rally: undefined,
        serves: [{ result: 'fault', location: 'none', type: 'none' }, { result: 'fault', location: 'none', type: 'none' }] }];
    const normal = stats(points);
    const advanced = renderToStaticMarkup(<AdvancedAnalysisView match={{ ...match, status: 'completed' }}
      points={points} nameA="Alice" nameB="Bob" back="/match/match/stats" />);
    const tables = advanced.match(/<table.*?<\/table>/g) ?? [];
    expect(tables[0]).toEqual(normal.match(/<table.*?<\/table>/)?.[0]);
    expect(tables).toHaveLength(6);
    // Lucky ball and manual points are excluded: 2 service points (Serve + 1 rally and double fault).
    expect(tables[2]).toContain('<th><strong>Service points</strong></th><td>2</td>');
    expect(tables[3]).toContain('<th>- Double fault</th><td>1</td><td>50%</td><td>0</td><td>0%</td>');
    expect(advanced).toContain('>Set 1</button>');
    // Unrecorded match information is hidden; unrecorded serve location/type count as Body/Flat.
    expect(advanced).not.toContain('<dt>Event</dt>');
    expect(advanced).not.toContain('Type not recorded');
    expect(tables[1]).toContain('<th>Body</th><td>3 (100%)</td><td>3 (100%)</td>');
    expect(normal).not.toContain('Advanced Analysis');
    expect(normal).not.toContain('<h2>Serve location</h2>');
    expect(normal).toContain('<h2>Serve performance</h2>');
    for (const label of ['Court side', 'Serve attempt', 'Key points', 'Serve location']) expect(normal).toContain(`aria-label="${label}"`);
    expect(normal).toContain('<th><strong>Service points</strong></th><td>2</td>');
  });

  it.each([false, true])('offers optional incoming controls after shot position (busy=%s)', (busy) => {
    const html = renderToStaticMarkup(<RallyEntry serverName="Alice" returnerName="Bob" busy={busy} onComplete={() => {}} />);
    const incoming = html.slice(html.indexOf('<h2>Incoming ball</h2>'), html.indexOf('class="btn btn-primary btn-big next-btn"'));
    expect(html.indexOf('<h2>Shot position</h2>')).toBeLessThan(html.indexOf('<h2>Incoming ball</h2>'));
    expect(html.indexOf('<h2>Incoming ball</h2>')).toBeLessThan(html.indexOf('<h2>Incoming direction</h2>'));
    for (const label of ['Slow', 'Fast', 'Heavy', 'Slice', 'Short', 'Deep', 'Cross', 'Down line', 'Inside out', 'Inside in', 'Short angle', 'Dropshot']) {
      expect(incoming).toContain(`>${label}</button>`);
    }
    expect(incoming.match(/aria-pressed="false"/g)).toHaveLength(12);
    expect(incoming.match(/disabled=""/g) ?? []).toHaveLength(busy ? 12 : 0);
    expect(incoming).toContain('<h2>Incoming direction</h2>');
  });

  it('marks each selected value in a multi-choice row independently', () => {
    const html = renderToStaticMarkup(<OptionRow title="Incoming ball" disabled={false}
      options={[{ value: 'fast', label: 'Fast' }, { value: 'heavy', label: 'Heavy' }, { value: 'slow', label: 'Slow' }]}
      value={['fast', 'heavy']} onPick={() => {}} />);
    expect(html).toContain('aria-pressed="true">Fast</button>');
    expect(html).toContain('aria-pressed="true">Heavy</button>');
    expect(html).toContain('aria-pressed="false">Slow</button>');
  });

  it('offers Drive volley instead of Topspin and uses Down line in rally entry', () => {
    const html = renderToStaticMarkup(<RallyEntry serverName="Alice" returnerName="Bob" busy={false} onComplete={() => {}} />);
    expect(html).toContain('Drive volley');
    expect(html).toContain('Down line');
    expect(html).not.toContain('Topspin');
    expect(html).not.toContain('Down the line');
  });

  it('shows Drive volley in stats without an empty legacy Topspin row', () => {
    const html = stats([point('drive_volley')]);
    expect(html).toContain('<tr><th>Drive volley</th><td>1</td><td>0</td></tr>');
    const shots = html.slice(html.indexOf('<h2>Shot type</h2>'), html.indexOf('<h2>Unforced errors</h2>'));
    expect(shots).toContain('<tr><th>Drive volley</th><td>1</td><td>0</td></tr>');
    expect(shots).toContain('<th>Alice W</th><th>Alice UE</th>');
    expect(shots).not.toContain('<th>Bob W</th>');
    expect(html).toContain('<th>Down line</th>');
    expect(html).not.toContain('Topspin');
  });

  it('retains legacy Topspin counts rather than reclassifying them as Drive volley', () => {
    const html = stats([point('topspin')]);
    expect(html).toContain('<tr><th>Topspin (legacy)</th><td>1</td><td>0</td></tr>');
    expect(html).toContain('<tr><th>Drive volley</th><td>0</td><td>0</td></tr>');
  });

  it('shows unspecified rally winners as Not set, not Topspin or Drive volley', () => {
    const html = stats([point('none')]);
    expect(html).toContain('<tr><th>Not set</th><td>1</td><td>0</td></tr>');
    expect(html).toContain('<tr><th>Drive volley</th><td>0</td><td>0</td></tr>');
    expect(html).not.toContain('Topspin');
  });

  it('shows Lucky ball only in total Winners, including on the shared stats view', () => {
    const recorded = point('drive_volley');
    if (!recorded.rally) throw new Error('Expected a rally fixture.');
    const html = stats([{ ...recorded, rally: { ...recorded.rally, lucky: true } }]);
    expect(html).toContain('<tr><th>Winners</th><td><strong>1</strong></td><td><strong>0</strong></td></tr>');
    expect(html).toContain('<tr><th>Points won</th><td>0</td><td>0</td></tr>');
    expect(html).toContain('<tr><th>- Rally winners</th><td>0</td><td>0</td></tr>');
    expect(html).toContain('<tr><th>Drive volley</th><td>0</td><td>0</td></tr>');
    expect(html).toContain('Lucky ball points count only in total Winners');
  });

  it.each([false, true])('shows unselected stroke toggles in Shot type (playerOnly=%s)', (playerOnly) => {
    const html = renderToStaticMarkup(<StatsView match={match} points={[point('drive_volley')]}
      nameA="Alice" nameB="Bob" playerOnly={playerOnly} />);
    const shots = html.slice(html.indexOf('<h2>Shot type</h2>'), html.indexOf('<h2>Unforced errors</h2>'));
    for (const label of ['Forehand', 'Backhand']) {
      expect(shots).toContain(`class="chip ">${label}</button>`);
    }
    expect(shots).toContain('No stroke selected = both forehand and backhand');
    expect(shots).toContain('<tr><th>Drive volley</th><td>1</td><td>0</td>');
  });

  it('puts player selection first in Shot type and Unforced errors and retains other filters', () => {
    const recorded = point('drive_volley');
    if (!recorded.rally) throw new Error('Expected a rally fixture.');
    const html = stats([{ ...recorded, winner: 'B', rally: { ...recorded.rally, ending: 'server_error', error: 'net' } }]);
    const errors = html.slice(html.indexOf('<h2>Unforced errors</h2>'));
    const shots = html.slice(html.indexOf('<h2>Shot type</h2>'), html.indexOf('<h2>Unforced errors</h2>'));
    for (const section of [shots, errors]) {
      expect(section).toMatch(/<\/h2><div class="chips"><button[^>]*class="chip on"[^>]*>Alice<\/button><button[^>]*>Bob<\/button><\/div>/);
      expect(section.indexOf('>Bob</button>')).toBeLessThan(section.indexOf('>Forehand</button>'));
      expect(section.indexOf('>Bob</button>')).toBeLessThan(section.indexOf('>Set 1</button>'));
    }
    expect(errors.match(/<th>Shot direction<\/th><th>Net<\/th><th>Long<\/th><th>Wide<\/th><th>Total<\/th>/g)).toHaveLength(1);
    expect(errors).toContain('aria-label="Alice unforced errors"');
    expect(errors).not.toContain('aria-label="Bob unforced errors"');
    expect(errors).toContain('<tr><th>Down line</th><td>1</td><td>0</td><td>0</td><td>1</td></tr>');
    for (const label of ['Forehand', 'Backhand', 'Baseline', 'Approach', 'Net']) expect(errors).toContain(`>${label}</button>`);
    expect(errors).toContain('<th>Not set</th>');
  });

  it('omits every opponent column, toggle and opponent-only legacy shot in player mode', () => {
    const html = renderToStaticMarkup(<StatsView match={match} points={[point('drive_volley'), {
      ...point('topspin'), id: 'opponent-winner', seq: 1, winner: 'B',
      rally: { count: 3, ending: 'returner_winner', stroke: 'forehand', direction: 'crosscourt', shotType: 'topspin', position: 'net' },
    }]} nameA="Alice" nameB="Combined opponents" playerOnly aggregate="2 completed matches" />);
    expect(html).not.toContain('Combined opponents');
    expect(html).not.toContain('Topspin');
    expect(html).not.toContain('>Alice</button>');
    expect(html).toContain('<tr><th>Winners</th><td><strong>1</strong></td></tr>');
    expect(html).toContain('<tr><th>Drive volley</th><td>1</td><td>0</td></tr>');
    expect(html.match(/<th>Net<\/th><th>Long<\/th><th>Wide<\/th><th>Total<\/th>/g)).toHaveLength(1);
  });
});
