import { useState, type FormEvent } from 'react';
import Header from '../components/Header';
import { db, newId } from '../../storage/db';
import { DEFAULT_RULE_SET_ID, describeRules } from '../../model/rules';
import type { Side, Surface } from '../../model/types';
import { navigate } from '../router';
import { useAllRuleSets, usePlayers } from '../hooks';

const ADD_PLAYER_LINK = `#/players/new?return=${encodeURIComponent('/match/new')}`;

export default function NewMatchPage() {
  const players = usePlayers() ?? [];
  const ruleSets = useAllRuleSets();
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [ruleSetId, setRuleSetId] = useState(DEFAULT_RULE_SET_ID);
  const [firstServer, setFirstServer] = useState<Side>('A');
  const [surface, setSurface] = useState<Surface | ''>('');
  const [indoor, setIndoor] = useState(false);
  const [venue, setVenue] = useState('');
  const [error, setError] = useState('');

  const ruleSet = ruleSets.find((r) => r.id === ruleSetId);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name;

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!playerAId || !playerBId) return setError('Choose both players.');
    if (playerAId === playerBId) return setError('Players must be different.');
    if (!ruleSet) return setError('Choose the rules.');
    const now = Date.now();
    const id = newId();
    await db.matches.add({
      id,
      playerAId,
      playerBId,
      ruleSetId: ruleSet.id,
      ruleSetName: ruleSet.name,
      rules: ruleSet.rules,
      firstServer,
      surface: surface || undefined,
      indoor,
      venue: venue.trim() || undefined,
      status: 'in_progress',
      startedAt: now,
      updatedAt: now,
    });
    navigate(`/match/${id}`);
  }

  const playerSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select player</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <Header title="New match" back="/match" />
      <main className="page">
        <form className="form" onSubmit={start}>
          <label>
            Player A
            {playerSelect(playerAId, setPlayerAId)}
          </label>
          <label>
            Player B
            {playerSelect(playerBId, setPlayerBId)}
          </label>
          <a href={ADD_PLAYER_LINK}>+ Add a new player</a>
          <label>
            Rules
            <select value={ruleSetId} onChange={(e) => setRuleSetId(e.target.value)}>
              {ruleSets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {ruleSet && <p className="muted">{describeRules(ruleSet.rules)}</p>}
          <fieldset>
            <legend>First server</legend>
            <div className="segmented">
              {(['A', 'B'] as const).map((side) => (
                <label key={side} className={firstServer === side ? 'active' : ''}>
                  <input
                    type="radio"
                    name="firstServer"
                    checked={firstServer === side}
                    onChange={() => setFirstServer(side)}
                  />
                  {nameOf(side === 'A' ? playerAId : playerBId) ?? `Player ${side}`}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Surface
            <select value={surface} onChange={(e) => setSurface(e.target.value as Surface | '')}>
              <option value="">-</option>
              <option value="hard">Hard</option>
              <option value="clay">Clay</option>
              <option value="grass">Grass</option>
              <option value="carpet">Carpet</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} />
            Indoor
          </label>
          <label>
            Venue
            <input value={venue} onChange={(e) => setVenue(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-big" type="submit">
            Start match
          </button>
        </form>
      </main>
    </>
  );
}
