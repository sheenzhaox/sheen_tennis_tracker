import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RULES } from '../../model/rules';
import type { Match, Point, ShotType } from '../../model/types';
import RallyEntry from '../components/RallyEntry';
import { StatsView } from './StatsPage';

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
