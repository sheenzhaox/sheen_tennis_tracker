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
    expect(html).toContain('<tr><th>Drive volley</th><td>1</td><td>0</td><td>0</td><td>0</td></tr>');
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
});
