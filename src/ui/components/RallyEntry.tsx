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

type EndBy = 'server' | 'returner';
type EndKind = 'winner' | 'error';

type Draft = Omit<RallyDetail, 'ending'> & { by: EndBy | null; kind: EndKind | null };

const EMPTY: Draft = {
  count: null,
  by: null,
  kind: null,
  stroke: 'none',
  error: 'none',
  lucky: false,
  direction: 'none',
  shotType: 'none',
  position: 'none',
};

const END_KINDS: { value: EndKind; label: string }[] = [
  { value: 'winner', label: 'Winner & forced error' },
  { value: 'error', label: 'Unforced error' },
];

const endingOf = (d: Draft): RallyEnding | null => (d.by && d.kind ? `${d.by}_${d.kind}` : null);

function toDetail(d: Draft, ending: RallyEnding): RallyDetail {
  const { by: _by, kind, error, lucky, ...rest } = d;
  return kind === 'error' ? { ...rest, ending, error } : { ...rest, ending, lucky };
}

/** Rally entry after "Serve in": rally count, how the point ended, and the last shot. */
export default function RallyEntry({ serverName, returnerName, busy, onComplete }: Props) {
  const [d, setD] = useState<Draft>(EMPTY);

  const players: { value: EndBy; label: string }[] = [
    { value: 'server', label: serverName },
    { value: 'returner', label: returnerName },
  ];

  const complete = (next: Draft) => {
    const ending = endingOf(next);
    if (ending) onComplete(toDetail(next, ending));
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

      <OptionRow title="Point ended by" options={players} value={d.by ?? ''} cols="two" disabled={busy} onPick={(v) => setD({ ...d, by: v })} />
      <OptionRow title="Ending" options={END_KINDS} value={d.kind ?? ''} cols="two" disabled={busy} onPick={(v) => setD({ ...d, kind: v })} />
      <OptionRow title="Stroke" options={STROKES} value={d.stroke} cols="two" disabled={busy} onPick={(v) => pick('stroke', v)} />

      {d.kind === 'error' && (
        <OptionRow title="Error type" options={RETURN_ERRORS} value={d.error ?? 'none'} disabled={busy} onPick={(v) => pick('error', v)} />
      )}
      {d.kind === 'winner' && (
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

      <button type="button" className="btn btn-primary btn-big next-btn" disabled={!endingOf(d) || busy} onClick={() => complete(d)}>
        Save point
      </button>
    </section>
  );
}
