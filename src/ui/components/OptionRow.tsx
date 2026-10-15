interface Props<T extends string> {
  title: string;
  options: { value: T; label: string }[];
  value: string | string[];
  cols?: 'two' | 'three';
  disabled: boolean;
  onPick: (value: T) => void;
}

export default function OptionRow<T extends string>({ title, options, value, cols = 'three', disabled, onPick }: Props<T>) {
  return (
    <>
      <h2>{title}</h2>
      <div className={`choice-grid ${cols}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`btn ${(Array.isArray(value) ? value.includes(o.value) : value === o.value) ? 'btn-primary' : ''}`}
            aria-pressed={Array.isArray(value) ? value.includes(o.value) : value === o.value}
            disabled={disabled}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}
