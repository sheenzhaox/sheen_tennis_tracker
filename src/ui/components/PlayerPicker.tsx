import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { GENDERS, isPlayerEmail, type Gender, type Player } from '../../model/types';
import { newId, saveRecord } from '../../storage/db';
import { isAdmin, useUser } from '../user';

interface Props {
  label: string;
  value: string;
  onChange: (id: string) => void;
  players: Player[];
  otherId: string;
  loading: boolean;
}

export function playerSuggestions(players: Player[], name: string): Player[] {
  const query = name.trim().toLowerCase();
  return query.length < 3 ? [] : players.filter((player) => !player.deletedAt && player.name.toLowerCase().includes(query));
}

export default function PlayerPicker({ label, value, onChange, players, otherId, loading }: Props) {
  const user = useUser();
  const id = useId();
  const selectedName = players.find((player) => player.id === value)?.name;
  const [name, setName] = useState(selectedName ?? '');
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [email, setEmail] = useState('');
  const activeOption = useRef<HTMLButtonElement>(null);
  const matches = playerSuggestions(players, name);
  const selectable = matches.filter((player) => player.id !== otherId);
  const active = selectable.find((player) => player.id === activeId) ?? selectable[0];
  const expanded = open && matches.length > 0;
  const offerAdd = !loading && !value && name.trim().length >= 3 && matches.length === 0;
  const canAdd = offerAdd && !!gender;

  useEffect(() => {
    if (value && selectedName) setName(selectedName);
  }, [value, selectedName]);

  useEffect(() => {
    if (expanded) activeOption.current?.scrollIntoView({ block: 'nearest' });
  }, [expanded, active?.id]);

  function choose(player: Player) {
    if (busy || player.id === otherId) return;
    setName(player.name);
    onChange(player.id);
    setOpen(false);
    setActiveId('');
    setError('');
    setGender('');
    setEmail('');
  }

  async function add() {
    if (busy || !canAdd) return;
    if (email.trim() && !isPlayerEmail(email.trim())) return setError('Enter a valid email address or leave it blank.');
    setBusy(true);
    setError('');
    try {
      const now = Date.now();
      const player: Player = {
        id: newId(), name: name.trim(), gender: gender || undefined, email: email.trim() || undefined,
        ownerId: isAdmin(user) ? undefined : user.id,
        createdAt: now, updatedAt: now,
      };
      await saveRecord('players', player);
      setName(player.name);
      onChange(player.id);
      setOpen(false);
      setGender('');
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (selectable.length) {
        const current = selectable.findIndex((player) => player.id === activeId);
        const next = event.key === 'ArrowDown' ? (current + 1) % selectable.length
          : current <= 0 ? selectable.length - 1 : current - 1;
        setActiveId(selectable[next].id);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Enter' && (expanded || canAdd || !value)) {
      event.preventDefault();
      if (expanded && active) choose(active);
      else if (canAdd) void add();
      else if (offerAdd) setError('Choose gender for the new player.');
    }
  }

  return (
    <div className="field player-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} role="combobox" autoComplete="off" value={name}
        maxLength={200}
        placeholder="Type at least 3 characters" disabled={busy || loading}
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-suggestions`}
        aria-activedescendant={expanded && active ? `${id}-${active.id}` : undefined}
        aria-describedby={`${id}-hint`}
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        onChange={(event) => {
          setName(event.target.value);
          onChange('');
          setOpen(true);
          setActiveId('');
          setError('');
        }} />
      <span id={`${id}-hint`} className="muted small">Search your players and admin-added players.</span>
      {expanded && (
        <ul id={`${id}-suggestions`} className="player-suggestions" role="listbox" aria-label={`${label} suggestions`}>
          {matches.map((player) => (
            <li key={player.id} role="presentation">
              <button id={`${id}-${player.id}`} type="button" role="option"
                ref={active?.id === player.id ? activeOption : undefined}
                aria-selected={active?.id === player.id} disabled={player.id === otherId || busy}
                tabIndex={-1} onClick={() => choose(player)}>
                <span>{player.name}</span>
                <span className="muted small">
                  {player.id === otherId ? 'Already selected'
                    : !player.ownerId ? 'System player' : player.ownerId === user.id ? 'My player' : 'Match player'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {offerAdd && <>
        <span className="muted small">No matching player found.</span>
        <label>{label} new player gender *
          <select value={gender} disabled={busy} onChange={(event) => setGender(event.target.value as Gender | '')}>
            <option value="">Select gender</option>
            {GENDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>{label} new player email (optional, recommended)
          <input type="email" maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="btn" type="button" disabled={busy || !canAdd} onClick={() => void add()}>
          {busy ? 'Adding...' : `+ Add new player: ${name.trim()}`}
        </button>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
