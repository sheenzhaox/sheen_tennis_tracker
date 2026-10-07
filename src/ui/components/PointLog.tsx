import { useLiveQuery } from 'dexie-react-hooks';
import { stringify } from 'csv-stringify/browser/esm/sync';
import { Download } from 'lucide-react';
import { computeScore, pointLabels } from '../../engine/score';
import { pointsForMatch } from '../../storage/db';
import {
  RETURN_DIRECTIONS,
  RETURN_ERRORS,
  RETURN_STROKES,
  SERVE_LOCATIONS,
  SERVE_RESULTS,
  SERVE_TYPES,
  SHOT_DIRECTIONS,
  SHOT_POSITIONS,
  SHOT_TYPES,
  STROKES,
  type Match,
  type Point,
  type PointEnd,
  type RallyDetail,
  type Serve,
  type Side,
} from '../../model/types';

const END_LABELS: Record<PointEnd, string> = {
  ace: 'Ace',
  double_fault: 'Double fault',
  return_winner: 'Return Ace',
  return_error: 'Return error',
  rally: 'Rally',
  unrecorded: 'Not recorded (manual score)',
};

const label = (list: { value: string; label: string }[], v: string | undefined) =>
  v && v !== 'none' ? list.find((x) => x.value === v)?.label : undefined;

function describeServe(s: Serve, n: number): string {
  const extras = [label(RETURN_ERRORS, s.fault), label(SERVE_LOCATIONS, s.location), label(SERVE_TYPES, s.type)].filter(Boolean);
  let text = `${n === 0 ? '1st' : '2nd'}: ${label(SERVE_RESULTS, s.result)}${extras.length ? ` (${extras.join(', ')})` : ''}`;
  if (s.return) {
    const r = [label(RETURN_STROKES, s.return.stroke), label(RETURN_DIRECTIONS, s.return.direction), label(RETURN_ERRORS, s.return.error)].filter(Boolean);
    if (r.length) text += ` - ${r.join(', ')}`;
  }
  return text;
}

function describeRally(r: RallyDetail, serverName: string, returnerName: string): string {
  const who = r.ending.startsWith('server') ? serverName : returnerName;
  const how = r.ending.endsWith('winner') ? 'winner & forced error' : 'unforced error';
  const parts = [
    `Rally ${r.count ?? 'None'}`,
    `${who} ${how}`,
    label(STROKES, r.stroke),
    label(RETURN_ERRORS, r.error),
    r.lucky ? 'Lucky ball' : undefined,
    label(SHOT_DIRECTIONS, r.direction),
    label(SHOT_TYPES, r.shotType),
    label(SHOT_POSITIONS, r.position),
  ];
  return parts.filter(Boolean).join(', ');
}

interface Props {
  match: Match;
  nameA: string;
  nameB: string;
}

function pointLogRows({ match, nameA, nameB }: Props, points: Point[]) {
  const name = (side: Side) => (side === 'A' ? nameA : nameB);
  const winners = points.map((point) => point.winner);
  return points.map((point, index) => {
    const before = computeScore(match.rules, match.firstServer ?? 'A', winners.slice(0, index));
    const labels = pointLabels(before, match.rules.noAd);
    const sets = before.sets.map((set) =>
      set.matchTiebreak && set.tiebreak ? `[${set.tiebreak.a}-${set.tiebreak.b}]` : `${set.a}-${set.b}`,
    );
    const current = before.isMatchTiebreak
      ? `MTB ${labels.a}-${labels.b}`
      : `${before.games.a}-${before.games.b} · ${before.inTiebreak ? 'TB ' : ''}${labels.a}-${labels.b}`;
    return {
      id: point.id,
      number: index + 1,
      score: [...sets, current].join(' · '),
      winner: name(point.winner),
      ending: END_LABELS[point.end],
      server: name(point.server),
      serves: point.serves.map(describeServe),
      rally: point.rally ? describeRally(point.rally, name(point.server), name(point.server === 'A' ? 'B' : 'A')) : '',
    };
  });
}

export function pointLogCsv(props: Props, points: Point[]): string {
  return stringify([
    ['Match ID', 'Player A', 'Player B', 'Point', 'Score before (A-B)', 'Winner', 'Ending', 'Server', 'First serve', 'Second serve', 'Rally'],
    ...pointLogRows(props, points).map((row) => [
      props.match.id, props.nameA, props.nameB, row.number, row.score, row.winner, row.ending, row.server,
      row.serves[0] ?? '', row.serves[1] ?? '', row.rally,
    ]),
  ], { bom: true, record_delimiter: 'windows', escape_formulas: true });
}

/** Point-by-point record with the score before each point. */
export default function PointLog({ match, nameA, nameB }: Props) {
  const points = useLiveQuery(() => pointsForMatch(match.id), [match.id]);
  if (!points) return null;
  const rows = pointLogRows({ match, nameA, nameB }, points);

  function exportCsv() {
    const csv = pointLogCsv({ match, nameA, nameB }, points!);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tennis-points-${match.date ?? 'match'}-${match.id}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      {rows.length === 0 && <p className="muted">No points recorded yet.</p>}
      <ol className="point-log">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="point-score">{row.score}</div>
            <div>
              <strong>{row.winner}</strong> won <span className="muted">· {row.ending} · {row.server} serving</span>
            </div>
            {row.serves.length > 0 && <div className="muted">{row.serves.join(' | ')}</div>}
            {row.rally && <div className="muted">{row.rally}</div>}
          </li>
        ))}
      </ol>
      <button className="btn" type="button" onClick={exportCsv} disabled={rows.length === 0} title="Export point-by-point details as CSV">
        <Download size={18} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
        Export CSV
      </button>
    </>
  );
}
