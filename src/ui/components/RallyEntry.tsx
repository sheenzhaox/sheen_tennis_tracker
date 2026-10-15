import { useState } from 'react';
import OptionRow from './OptionRow';
import {
  INCOMING_BALLS,
  INCOMING_DIRECTIONS,
  RETURN_ERRORS,
  SERVE_IMPACTS,
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
  impact: 'none',
  ending: null,
  stroke: 'none',
  error: 'none',
  lucky: false,
  direction: 'none',
  shotType: 'none',
  position: 'none',
  incomingBall: [],
  incomingDirection: 'none',
};

const isError = (e: RallyEnding | null) => e === 'server_error' || e === 'returner_error';

function toDetail(d: Draft, ending: RallyEnding): RallyDetail {
  const { ending: _e, error, lucky, ...rest } = d;
  return isError(ending) ? { ...rest, ending, error } : { ...rest, ending, lucky };
}

/** Rally entry after "Serve in": serve impact, how the point ended, and the last shot. */
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

  function pick<K extends 'impact' | 'stroke' | 'error' | 'direction' | 'shotType' | 'position' | 'incomingDirection'>(key: K, value: Draft[K]) {
    const next = { ...d, [key]: d[key] === value ? 'none' : value };
    setD(next);
  }

  // Serve + 1 means the server ended the point on shot 3 with a winner or forced error.
  const pickImpact = (value: Draft['impact']) => {
    if (value === 'serve_plus_one' && d.impact !== value) setD({ ...d, impact: value, ending: 'server_winner' });
    else pick('impact', value);
  };
  const pickEnding = (ending: RallyEnding) =>
    setD({ ...d, ending, impact: d.impact === 'serve_plus_one' && ending !== 'server_winner' ? 'none' : d.impact });

  return (
    <section className="serve-entry">
      <OptionRow title="Serve Impact State" options={SERVE_IMPACTS} value={d.impact ?? 'none'} cols="two" disabled={busy} onPick={pickImpact} />

      <h2>Point ending</h2>
      <div className="choice-grid two">
        {endings.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`btn ${o.tone} ${d.ending === o.value ? 'btn-primary' : ''}`}
            aria-pressed={d.ending === o.value}
            disabled={busy}
            onClick={() => pickEnding(o.value)}
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
      <OptionRow title="Incoming ball" options={INCOMING_BALLS} value={d.incomingBall ?? []} disabled={busy} onPick={(value) => setD({
        ...d,
        incomingBall: (d.incomingBall ?? []).includes(value)
          ? d.incomingBall?.filter((ball) => ball !== value)
          : [...(d.incomingBall ?? []), value],
      })} />
      <OptionRow title="Incoming direction" options={INCOMING_DIRECTIONS} value={d.incomingDirection ?? 'none'} disabled={busy} onPick={(value) => pick('incomingDirection', value)} />

      <button type="button" className="btn btn-primary btn-big next-btn" disabled={!d.ending || busy} onClick={() => complete(d)}>
        Save point
      </button>
    </section>
  );
}
