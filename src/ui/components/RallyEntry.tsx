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

const isError = (e: RallyEnding | null) => e === 'server_error' || e === 'returner_error';

function toDetail(d: Draft, ending: RallyEnding): RallyDetail {
  const { ending: _e, error, lucky, ...rest } = d;
  return isError(ending) ? { ...rest, ending, error } : { ...rest, ending, lucky };
}

/** Rally entry after "Serve in": rally count, how the point ended, and the last shot. */
export default function RallyEntry({ serverName, returnerName, busy, onComplete }: Props) {
  const [d, setD] = useState<Draft>(EMPTY);

  const endings: { value: RallyEnding; label: string; tone: 'ace' | 'fault' }[] = [
    { value: 'server_winner', label: `${serverName} winner`, tone: 'ace' },
    { value: 'returner_winner', label: `${returnerName} winner`, tone: 'ace' },
    { value: 'server_error', label: `${serverName} UE`, tone: 'fault' },
    { value: 'returner_error', label: `${returnerName} UE`, tone: 'fault' },
  ];
  const kind = d.ending ? (isError(d.ending) ? 'error' : 'winner') : null;

  const complete = (next: Draft) => {
    if (next.ending) onComplete(toDetail(next, next.ending));
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

      <h2>Point ending</h2>
      <div className="choice-grid two">
        {endings.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`btn ${o.tone} ${d.ending === o.value ? 'btn-primary' : ''}`}
            aria-pressed={d.ending === o.value}
            disabled={busy}
            onClick={() => setD({ ...d, ending: o.value })}
          >
            {o.label}
          </button>
        ))}
      </div>
      <OptionRow title="Stroke" options={STROKES} value={d.stroke} cols="two" disabled={busy} onPick={(v) => pick('stroke', v)} />

      {kind === 'error' && (
        <OptionRow title="Error type" options={RETURN_ERRORS} value={d.error ?? 'none'} disabled={busy} onPick={(v) => pick('error', v)} />
      )}
      {kind === 'winner' && (
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
