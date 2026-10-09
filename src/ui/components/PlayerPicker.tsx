import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Player } from '../../model/types';
import { useUser } from '../user';

interface Props {
  label: string;
  value: string;
  onChange: (id: string) => void;
  onNameChange: (name: string) => void;
  players: Player[];
  otherId: string;
  loading: boolean;
}

export function playerSuggestions(players: Player[], name: string): Player[] {
  const query = name.trim().toLowerCase();
  return query.length < 3 ? [] : players.filter((player) => !player.deletedAt && player.name.toLowerCase().includes(query));
}

export default function PlayerPicker({ label, value, onChange, onNameChange, players, otherId, loading }: Props) {
  const user = useUser();
  const id = useId();
  const selectedName = players.find((player) => player.id === value)?.name;
  const [name, setName] = useState(selectedName ?? '');
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const activeOption = useRef<HTMLButtonElement>(null);
  const matches = playerSuggestions(players, name);
  const selectable = matches.filter((player) => player.id !== otherId);
  const active = selectable.find((player) => player.id === activeId);
  const expanded = open && matches.length > 0;

  useEffect(() => {
    if (value && selectedName) setName(selectedName);
  }, [value, selectedName]);

  useEffect(() => {
    if (expanded) activeOption.current?.scrollIntoView({ block: 'nearest' });
  }, [expanded, active?.id]);

  function choose(player: Player) {
    if (player.id === otherId) return;
    setName(player.name);
    onNameChange(player.name);
    onChange(player.id);
    setOpen(false);
    setActiveId('');
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
    } else if (event.key === 'Enter' && expanded && active) {
      event.preventDefault();
      choose(active);
    }
  }

  return (
    <div className="field player-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} role="combobox" autoComplete="off" value={name}
        maxLength={200}
        placeholder="Type a name" disabled={loading}
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-suggestions`}
        aria-activedescendant={expanded && active ? `${id}-${active.id}` : undefined}
        aria-describedby={`${id}-hint`}
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        onChange={(event) => {
          setName(event.target.value);
          onNameChange(event.target.value);
          onChange('');
          setOpen(true);
          setActiveId('');
        }} />
      <span id={`${id}-hint`} className="muted small">
        Choose a suggestion to reuse a player (3 characters to search). Otherwise, Next creates a new private player.
      </span>
      {expanded && (
        <ul id={`${id}-suggestions`} className="player-suggestions" role="listbox" aria-label={`${label} suggestions`}>
          {matches.map((player) => (
            <li key={player.id} role="presentation">
              <button id={`${id}-${player.id}`} type="button" role="option"
                ref={active?.id === player.id ? activeOption : undefined}
                aria-selected={active?.id === player.id} disabled={player.id === otherId}
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
    </div>
  );
}
