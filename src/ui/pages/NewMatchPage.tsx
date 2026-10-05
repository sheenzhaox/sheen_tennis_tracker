import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, isLive, newId, saveRecord } from '../../storage/db';
import { DEFAULT_RULE_SET_ID, describeRules } from '../../model/rules';
import { SURFACES, type Match, type Player, type Surface } from '../../model/types';
import { navigate } from '../router';
import { useAllRuleSets, usePlayers } from '../hooks';
import { todayIso } from '../format';
import { canEditMatch, useUser } from '../user';

const NEW_PLAYER = '__new__';

/** Step 1 of a match: setup. Used for new matches and for editing a match that hasn't started. */
export default function NewMatchPage({ id }: { id?: string }) {
  const user = useUser();
  const match = useLiveQuery(async () => {
    if (!id) return null;
    const m = await db.matches.get(id);
    return isLive(m) ? m : null;
  }, [id]);

  if (id && match === undefined) return null;
  if (id && (!match || match.status !== 'scheduled' || !canEditMatch(user, match))) {
    return (
      <>
        <Header title="Match setup" back={id ? `/match/${id}` : '/match'} />
        <main className="page">
          <p>
            {!match
              ? 'Match not found.'
              : !canEditMatch(user, match)
                ? 'This match is view only.'
                : 'This match has already started; its setup can no longer be changed.'}
          </p>
        </main>
      </>
    );
  }
  return <SetupForm key={id ?? 'new'} existing={match ?? null} />;
}

function SetupForm({ existing }: { existing: Match | null }) {
  const user = useUser();
  const players = usePlayers() ?? [];
  const ruleSets = useAllRuleSets();
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [playerAId, setPlayerAId] = useState(existing?.playerAId ?? '');
  const [playerBId, setPlayerBId] = useState(existing?.playerBId ?? '');
  const [surface, setSurface] = useState<Surface | ''>(existing?.surface ?? '');
  const [event, setEvent] = useState(existing?.event ?? '');
  const [round, setRound] = useState(existing?.round ?? '');
  const [venue, setVenue] = useState(existing?.venue ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [ruleSetId, setRuleSetId] = useState(existing?.ruleSetId ?? DEFAULT_RULE_SET_ID);
  const [error, setError] = useState('');

  const ruleSet = ruleSets.find((r) => r.id === ruleSetId);
  const rules = ruleSet?.rules ?? existing?.rules;

  async function next(e: FormEvent) {
    e.preventDefault();
    if (!date) return setError('Choose the date.');
    if (!playerAId || !playerBId) return setError('Choose both players.');
    if (playerAId === playerBId) return setError('Players must be different.');
    if (!surface) return setError('Choose the surface.');
    if (!rules) return setError('Choose the match format.');
    const now = Date.now();
    const id = existing?.id ?? newId();
    await saveRecord<Match>('matches', {
      ...existing,
      id,
      date,
      playerAId,
      playerBId,
      surface,
      event: event.trim() || undefined,
      round: round.trim() || undefined,
      venue: venue.trim() || undefined,
      notes: notes.trim() || undefined,
      ruleSetId,
      ruleSetName: ruleSet?.name ?? existing?.ruleSetName ?? '',
      rules,
      status: 'scheduled',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ownerId: existing?.ownerId ?? user.id,
      ownerName: existing?.ownerName ?? user.username,
    });
    navigate(`/match/${id}`);
  }

  return (
    <>
      <Header title={existing ? 'Edit match setup' : 'New match'} back={existing ? `/match/${existing.id}` : '/match'} />
      <main className="page">
        <form className="form" onSubmit={next}>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <PlayerPicker label="Player A" value={playerAId} onChange={setPlayerAId} players={players} otherId={playerBId} />
          <PlayerPicker label="Player B" value={playerBId} onChange={setPlayerBId} players={players} otherId={playerAId} />

          <fieldset>
            <legend>Surface</legend>
            <div className="segmented">
              {SURFACES.map((s) => (
                <label key={s.value} className={surface === s.value ? 'active' : ''}>
                  <input type="radio" name="surface" checked={surface === s.value} onChange={() => setSurface(s.value)} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Match info</legend>
            <div className="form">
              <label>
                Event / tournament
                <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="e.g. Club championship" />
              </label>
              <label>
                Round
                <input value={round} onChange={(e) => setRound(e.target.value)} placeholder="e.g. Quarter-final" />
              </label>
              <label>
                Venue / court
                <input value={venue} onChange={(e) => setVenue(e.target.value)} />
              </label>
              <label>
                Notes
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          </fieldset>

          <label>
            Match format
            <select value={ruleSetId} onChange={(e) => setRuleSetId(e.target.value)}>
              {!ruleSet && existing && <option value={existing.ruleSetId}>{existing.ruleSetName}</option>}
              {ruleSets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {rules && <p className="muted">{describeRules(rules)}</p>}
          <a href="#/rules">Manage rules</a>

          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-big" type="submit">
            Next
          </button>
        </form>
      </main>
    </>
  );
}

interface PickerProps {
  label: string;
  value: string;
  onChange: (id: string) => void;
  players: Player[];
  otherId: string;
}

function PlayerPicker({ label, value, onChange, players, otherId }: PickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    const id = newId();
    await saveRecord<Player>('players', { id, name: trimmed, createdAt: now, updatedAt: now });
    onChange(id);
    setName('');
    setAdding(false);
  }

  if (adding) {
    return (
      <div className="field">
        <span>{label} - new player</span>
        <div className="inline-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
          />
          <button className="btn btn-primary" type="button" onClick={() => void add()} disabled={!name.trim()}>
            Add
          </button>
          <button className="btn" type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(e) => (e.target.value === NEW_PLAYER ? setAdding(true) : onChange(e.target.value))}
      >
        <option value="">Select player</option>
        {players.map((p) => (
          <option key={p.id} value={p.id} disabled={p.id === otherId}>
            {p.name}
          </option>
        ))}
        <option value={NEW_PLAYER}>+ New player...</option>
      </select>
    </label>
  );
}
