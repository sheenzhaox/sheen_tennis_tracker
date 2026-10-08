import type { Club } from '../../model/types';

export default function ClubPicker({ clubs, value, onChange, disabled = false }: {
  clubs: Club[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  return (
    <fieldset className="form club-picker" disabled={disabled}>
      <legend>Clubs</legend>
      {clubs.length === 0 && <p className="muted">No clubs available. An admin can add clubs in Settings.</p>}
      {clubs.map((club) => (
        <label className="checkbox" key={club.id}>
          <input type="checkbox" checked={value.includes(club.id)}
            onChange={(event) => onChange(event.target.checked ? [...value, club.id] : value.filter((id) => id !== club.id))} />
          {club.name}
        </label>
      ))}
    </fieldset>
  );
}
