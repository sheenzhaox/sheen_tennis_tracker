import { useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import PlayerPicker from '../components/PlayerPicker';
import { db, isLive, newId, saveRecord } from '../../storage/db';
import { DEFAULT_RULE_SET_ID, describeRules } from '../../model/rules';
import { SURFACES, type Match, type Player, type Surface } from '../../model/types';
import { navigate } from '../router';
import { useAllPlayers, useAllRuleSets } from '../hooks';
import { todayIso } from '../format';
import { canEditMatch, canSelectPlayer, useUser } from '../user';

export function resolveMatchPlayers(a: { id: string; name: string }, b: { id: string; name: string }, players: Player[], ownerId: string) {
  const newPlayers: Player[] = [];
  const now = Date.now();
  function resolve(choice: { id: string; name: string }): string {
    if (choice.id) {
      if (!players.some((player) => player.id === choice.id && !player.deletedAt)) {
        throw new Error('A selected player is no longer available. Choose a player or type a name again.');
      }
      return choice.id;
    }
    const name = choice.name.trim();
    if (!name || name.length > 200) throw new Error('Enter a name of 1-200 characters for both players.');
    const player: Player = { id: newId(), name, ownerId, createdAt: now, updatedAt: now };
    newPlayers.push(player);
    return player.id;
  }
  const playerAId = resolve(a);
  const playerBId = resolve(b);
  if (playerAId === playerBId) throw new Error('Players must be different.');
  return { playerAId, playerBId, newPlayers };
}

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
  const allPlayers = useAllPlayers();
  // Keep the current players selectable when editing a match that uses another user's private player.
  const players = (allPlayers ?? []).filter(
    (p) => canSelectPlayer(user, p) || p.id === existing?.playerAId || p.id === existing?.playerBId,
  );
  const ruleSets = useAllRuleSets();
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [playerAId, setPlayerAId] = useState(existing?.playerAId ?? '');
  const [playerBId, setPlayerBId] = useState(existing?.playerBId ?? '');
  const [playerAName, setPlayerAName] = useState('');
  const [playerBName, setPlayerBName] = useState('');
  const [surface, setSurface] = useState<Surface | ''>(existing?.surface ?? '');
  const [event, setEvent] = useState(existing?.event ?? '');
  const [round, setRound] = useState(existing?.round ?? '');
  const [venue, setVenue] = useState(existing?.venue ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [ruleSetId, setRuleSetId] = useState(existing?.ruleSetId ?? DEFAULT_RULE_SET_ID);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  const ruleSet = ruleSets.find((r) => r.id === ruleSetId);
  const rules = ruleSet?.rules ?? existing?.rules;

  async function next(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    setError('');
    if (allPlayers === undefined) return setError('Players are still loading. Please try again.');
    if (!date) return setError('Choose the date.');
    if (!surface) return setError('Choose the surface.');
    if (!rules) return setError('Choose the match format.');
    saving.current = true;
    setBusy(true);
    try {
      const participants = resolveMatchPlayers(
        { id: playerAId, name: playerAName }, { id: playerBId, name: playerBName }, players, user.id,
      );
      const now = Date.now();
      const id = existing?.id ?? newId();
      await db.transaction('rw', db.players, db.matches, async () => {
        for (const player of participants.newPlayers) await saveRecord('players', player);
        await saveRecord<Match>('matches', {
          ...existing,
          id,
          date,
          playerAId: participants.playerAId,
          playerBId: participants.playerBId,
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
      });
      navigate(`/match/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Header title={existing ? 'Edit match setup' : 'New match'} back={existing ? `/match/${existing.id}` : '/match'} />
      <main className="page">
        <form className="form" onSubmit={next}>
          <fieldset className="form" disabled={busy}>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <PlayerPicker label="Player A" value={playerAId} onChange={setPlayerAId} onNameChange={setPlayerAName} players={players} otherId={playerBId} loading={allPlayers === undefined} />
          <PlayerPicker label="Player B" value={playerBId} onChange={setPlayerBId} onNameChange={setPlayerBName} players={players} otherId={playerAId} loading={allPlayers === undefined} />

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

          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-big" type="submit" disabled={busy || allPlayers === undefined}>
            {busy ? 'Saving...' : 'Next'}
          </button>
          </fieldset>
        </form>
      </main>
    </>
  );
}
