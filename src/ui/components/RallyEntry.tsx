import { useState } from 'react';
import OptionRow from './OptionRow';
import {
  RETURN_ERRORS,
  SHOT_DIRECTIONS,
  SHOT_POSITIONS,
  SHOT_TYPES,
  STROKES,
  type RallyDetail,
  type RallyEnding,
} from '../../model/types';

interface Props {
  serverName: string;
  returnerName: string;
  busy: boolean;
  onComplete: (rally: RallyDetail) => void;
}

type Draft = Omit<RallyDetail, 'ending'> & { ending: RallyEnding | null };

const EMPTY: Draft = {
  count: null,
  ending: null,
  stroke: 'none',
  error: 'none',
  lucky: false,
  direction: 'none',
  shotType: 'none',
  position: 'none',
};

const isUnforced = (e: RallyEnding | null) => e === 'server_error' || e === 'returner_error';

function toDetail(d: Draft & { ending: RallyEnding }): RallyDetail {
  const { error, lucky, ...rest } = d;
  return isUnforced(d.ending) ? { ...rest, error } : { ...rest, lucky };
}

/** Rally entry after "Serve in": rally count, how the point ended, and the last shot. */
export default function RallyEntry({ serverName, returnerName, busy, onComplete }: Props) {
  const [d, setD] = useState<Draft>(EMPTY);

  const endings: { value: RallyEnding; label: string }[] = [
    { value: 'server_winner', label: `${serverName} winner & forced error` },
    { value: 'returner_winner', label: `${returnerName} winner & forced error` },
    { value: 'server_error', label: `${serverName} unforced error` },
    { value: 'returner_error', label: `${returnerName} unforced error` },
  ];

  const complete = (next: Draft) => {
    if (next.ending) onComplete(toDetail({ ...next, ending: next.ending }));
  };

  function pick<K extends 'stroke' | 'error' | 'direction' | 'shotType' | 'position'>(key: K, value: Draft[K]) {
    const next = { ...d, [key]: d[key] === value ? 'none' : value };
    setD(next);
    // Shot position is the last row, so it completes the point once the ending is known.
    if (key === 'position' && next.position !== 'none') complete(next);
  }

  return (
    <section className="serve-entry">
      <button
        type="button"
        className="btn btn-big rally-count"
        disabled={busy}
        onClick={() => setD({ ...d, count: (d.count ?? 0) + 1 })}
      >
        + Rally count: {d.count ?? 'None'}
      </button>

      <OptionRow title="Point ending" options={endings} value={d.ending ?? ''} cols="two" disabled={busy} onPick={(v) => setD({ ...d, ending: v })} />
      <OptionRow title="Stroke" options={STROKES} value={d.stroke} cols="two" disabled={busy} onPick={(v) => pick('stroke', v)} />

      {isUnforced(d.ending) && (
        <OptionRow title="Error type" options={RETURN_ERRORS} value={d.error ?? 'none'} disabled={busy} onPick={(v) => pick('error', v)} />
      )}
      {d.ending && !isUnforced(d.ending) && (
        <>
          <h2>Optional</h2>
          <button
            type="button"
            className={`btn ${d.lucky ? 'btn-primary' : ''}`}
            aria-pressed={d.lucky}
            disabled={busy}
            onClick={() => setD({ ...d, lucky: !d.lucky })}
          >
            Lucky ball
          </button>
        </>
      )}

      <OptionRow title="Shot direction" options={SHOT_DIRECTIONS} value={d.direction} disabled={busy} onPick={(v) => pick('direction', v)} />
      <OptionRow title="Shot type" options={SHOT_TYPES} value={d.shotType} disabled={busy} onPick={(v) => pick('shotType', v)} />
      <OptionRow title="Shot position" options={SHOT_POSITIONS} value={d.position} disabled={busy} onPick={(v) => pick('position', v)} />

      <button type="button" className="btn btn-primary btn-big next-btn" disabled={!d.ending || busy} onClick={() => complete(d)}>
        Save point
      </button>
    </section>
  );
}
