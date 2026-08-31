interface Props {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

/** Tick-marked selection row. State by fill and tick, never by hue. */
export function ChoiceCard({ title, description, selected, onSelect }: Props) {
  return (
    <button type="button" className="choice" aria-pressed={selected} onClick={onSelect}>
      <span>
        <span className="choice__t">{title}</span>
        <span className="choice__d">{description}</span>
      </span>
      {selected && (
        <span className="choice__ck" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}
