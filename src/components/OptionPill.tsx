interface Props {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

/**
 * All five comfort options are identical in every respect except selection.
 * No number, no icon, no colour-coding, no ordering cue — anything implying a
 * "good" answer corrupts the only signal the ramp has.
 */
export function OptionPill({ label, selected, onSelect }: Props) {
  return (
    <button type="button" className="opt" aria-pressed={selected} onClick={onSelect}>
      {label}
    </button>
  );
}
