import { pointLabels, sideKey, type ScoreState } from '../../engine/score';
import type { Side } from '../../model/types';

interface Props {
  score: ScoreState;
  noAd: boolean;
  nameA: string;
  nameB: string;
  /** Adds a missed (unrecorded) point for a player. */
  onAddPoint?: (side: Side) => void;
  addDisabled?: boolean;
}

export default function ScoreTable({ score, noAd, nameA, nameB, onAddPoint, addDisabled }: Props) {
  const live = !score.winner;
  const labels = pointLabels(score, noAd);
  const showCurrentSet = live && !score.isMatchTiebreak;

  const row = (side: Side, name: string) => {
    const k = sideKey(side);
    const o = sideKey(side === 'A' ? 'B' : 'A');
    return (
      <tr key={side} className={score.winner === side ? 'winner' : ''}>
        <th scope="row">
          <span className={`serve-dot ${live && score.server === side ? 'on' : ''}`} aria-label={live && score.server === side ? 'serving' : undefined} />
          {name}
          {onAddPoint && live && (
            <button
              type="button"
              className="add-point-btn"
              aria-label={`Add missed point for ${name}`}
              disabled={addDisabled}
              onClick={() => onAddPoint(side)}
            >
              +
            </button>
          )}
        </th>
        {score.sets.map((s, i) =>
          s.matchTiebreak && s.tiebreak ? (
            <td key={i}>[{s.tiebreak[k]}]</td>
          ) : (
            <td key={i} className={s[k] > s[o] ? 'set-won' : ''}>
              {s[k]}
              {s.tiebreak && s[k] < s[o] && <sup>{s.tiebreak[k]}</sup>}
            </td>
          ),
        )}
        {showCurrentSet && <td className="current">{score.games[k]}</td>}
        {live && <td className="points">{labels[k]}</td>}
      </tr>
    );
  };

  return (
    <table className="score-table">
      <thead>
        <tr>
          <th />
          {score.sets.map((s, i) => (
            <th key={i}>{s.matchTiebreak ? 'MTB' : `S${i + 1}`}</th>
          ))}
          {showCurrentSet && <th>S{score.sets.length + 1}</th>}
          {live && <th>{score.isMatchTiebreak ? 'MTB' : score.inTiebreak ? 'TB' : 'Pts'}</th>}
        </tr>
      </thead>
      <tbody>
        {row('A', nameA)}
        {row('B', nameB)}
      </tbody>
    </table>
  );
}
