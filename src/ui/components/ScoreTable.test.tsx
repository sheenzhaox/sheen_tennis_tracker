import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeScore } from '../../engine/score';
import ScoreTable from './ScoreTable';

const score = computeScore({
  bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, tiebreakPoints: 7, noAd: false,
  finalSet: 'regular', finalSetTiebreakPoints: 7, matchTiebreakPoints: 10,
}, 'A', ['A']);

it('keeps the partial score but hides serving and point-entry controls after finalisation', () => {
  const html = renderToStaticMarkup(<ScoreTable score={score} noAd={false} nameA="Alice" nameB="Bob"
    finished winner="B" onAddPoint={() => {}} />);
  expect(html).toContain('15');
  expect(html).toContain('S1');
  expect(html).toContain('class="winner"');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('aria-label="serving"');
});

it('preserves point-entry controls and the serving indicator for a live match', () => {
  const html = renderToStaticMarkup(<ScoreTable score={score} noAd={false} nameA="Alice" nameB="Bob" onAddPoint={() => {}} />);
  expect(html).toContain('Add missed point for Alice');
  expect(html).toContain('aria-label="serving"');
});
