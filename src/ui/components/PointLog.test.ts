import { describe, expect, it } from 'vitest';
import type { Match, Point } from '../../model/types';
import { pointLogCsv } from './PointLog';

const match: Match = {
  id: 'match-1', playerAId: 'a', playerBId: 'b', ruleSetId: 'rules', ruleSetName: 'Standard',
  rules: {
    bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, tiebreakPoints: 7, noAd: false,
    finalSet: 'regular', finalSetTiebreakPoints: 7, matchTiebreakPoints: 10,
  },
  firstServer: 'A', status: 'in_progress', updatedAt: 1,
};

const props = { match, nameA: 'Alice', nameB: 'Bob' };
const point: Point = {
  id: 'point-1', matchId: match.id, seq: 0, server: 'A', winner: 'A',
  serves: [], end: 'unrecorded', createdAt: 1, updatedAt: 1,
};

describe('pointLogCsv', () => {
  it('exports a header with UTF-8 BOM and one row per point with the score before it', () => {
    const csv = pointLogCsv(props, [point, { ...point, id: 'point-2', seq: 1, winner: 'B' }]);
    expect(csv.startsWith('\uFEFFMatch ID,Player A,Player B,Point,Score before (A-B)')).toBe(true);
    expect(csv).toContain('match-1,Alice,Bob,1,0-0 · 0-0,Alice,Not recorded (manual score),Alice,,,,\r\n');
    expect(csv).toContain('match-1,Alice,Bob,2,0-0 · 15-0,Bob,Not recorded (manual score),Alice,,,,\r\n');
    expect(csv.split('\r\n')).toHaveLength(4);
  });

  it('preserves both serves and return details, quoting commas', () => {
    const csv = pointLogCsv(props, [{
      ...point, winner: 'B', end: 'return_winner',
      serves: [
        { result: 'fault', location: 'wide', type: 'flat', fault: 'net' },
        { result: 'return_winner', location: 't', type: 'kick', return: { stroke: 'backhand', direction: 'crosscourt' } },
      ],
    }]);
    expect(csv).toContain('"1st: Fault (Net, Wide, Flat)"');
    expect(csv).toContain('"2nd: Return Ace (T, Kick) - Backhand return, Crosscourt"');
  });

  it('exports the displayed rally description including optional details', () => {
    const csv = pointLogCsv(props, [{
      ...point, end: 'rally', serves: [{ result: 'in', location: 'none', type: 'none' }],
      rally: { count: 5, ending: 'server_winner', stroke: 'forehand', lucky: true, direction: 'crosscourt', shotType: 'topspin', position: 'baseline' },
    }]);
    expect(csv).toContain('"Rally 5, Alice winner & forced error, Forehand, Lucky ball, Cross court, Topspin (legacy), Baseline"');
  });

  it('exports drive volleys with the shorter rally direction label', () => {
    const csv = pointLogCsv(props, [{
      ...point, end: 'rally', serves: [{ result: 'in', location: 'none', type: 'none' }],
      rally: { count: 4, ending: 'server_winner', stroke: 'forehand', direction: 'down_the_line', shotType: 'drive_volley', position: 'net' },
    }]);
    expect(csv).toContain('"Rally 4, Alice winner & forced error, Forehand, Down line, Drive volley, Net"');
  });
  it('escapes names containing quotes, commas, and newlines, and protects formula-like names', () => {
    const csv = pointLogCsv({ ...props, nameA: 'Zo\u00eb, "Ace"\nZhao', nameB: '=1+1' }, [point]);
    expect(csv).toContain('"Zo\u00eb, ""Ace""\nZhao"');
    expect(csv).toContain(",'=1+1,");
  });

  it('exports only the header when there are no recorded points', () => {
    expect(pointLogCsv(props, []).split('\r\n')).toHaveLength(2);
  });

  it('exports multiline observations and protects formula-like notes', () => {
    const csv = pointLogCsv(props, [{ ...point, notes: 'Late contact,\n"watch footwork"' }]);
    expect(csv).toContain('Rally,Notes\r\n');
    expect(csv).toContain('"Late contact,\n""watch footwork"""');
    expect(pointLogCsv(props, [{ ...point, notes: '=1+1' }])).toContain(",'=1+1\r\n");
  });
});