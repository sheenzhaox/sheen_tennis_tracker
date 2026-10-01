import { useLiveQuery } from 'dexie-react-hooks';
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
  type PointEnd,
  type RallyDetail,
  type Serve,
  type Side,
} from '../../model/types';

const END_LABELS: Record<PointEnd, string> = {
  ace: 'Ace',
  double_fault: 'Double fault',
  return_winner: 'Return Ace',
  return_error: 'Unforced Error Return',
  rally: 'Rally',
};

const label = (list: { value: string; label: string }[], v: string | undefined) =>
  v && v !== 'none' ? list.find((x) => x.value === v)?.label : undefined;

function describeServe(s: Serve, n: number): string {
  const extras = [label(SERVE_LOCATIONS, s.location), label(SERVE_TYPES, s.type)].filter(Boolean);
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

/** Point-by-point record with the score before each point. */
export default function PointLog({ match, nameA, nameB }: Props) {
  const points = useLiveQuery(() => pointsForMatch(match.id), [match.id]);
  if (!points) return null;
  if (points.length === 0) return <p className="muted">No points recorded yet.</p>;

  const name = (s: Side) => (s === 'A' ? nameA : nameB);
  const firstServer = match.firstServer ?? 'A';
  const winners = points.map((p) => p.winner);

  return (
    <ol className="point-log">
      {points.map((p, i) => {
        const before = computeScore(match.rules, firstServer, winners.slice(0, i));
        const pts = pointLabels(before, match.rules.noAd);
        const sets = before.sets.map((s) => (s.matchTiebreak && s.tiebreak ? `[${s.tiebreak.a}-${s.tiebreak.b}]` : `${s.a}-${s.b}`));
        const current = before.isMatchTiebreak
          ? `MTB ${pts.a}-${pts.b}`
          : `${before.games.a}-${before.games.b} · ${before.inTiebreak ? 'TB ' : ''}${pts.a}-${pts.b}`;
        return (
          <li key={p.id}>
            <div className="point-score">{[...sets, current].join(' · ')}</div>
            <div>
              <strong>{name(p.winner)}</strong> won <span className="muted">· {END_LABELS[p.end]} · {name(p.server)} serving</span>
            </div>
            <div className="muted">{p.serves.map(describeServe).join(' | ')}</div>
            {p.rally && <div className="muted">{describeRally(p.rally, name(p.server), name(p.server === 'A' ? 'B' : 'A'))}</div>}
          </li>
        );
      })}
    </ol>
  );
}
