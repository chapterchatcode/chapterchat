import { useState } from "react";
import { Button } from "../components/Button";
import { OptionPill } from "../components/OptionPill";
import { StepBar } from "../components/StepBar";
import { useSurface } from "../hooks";
import type { Rating } from "../core";

/**
 * The five-point vote. Labels only — a number is never displayed, because
 * users read "5" as "best" and over-report to please the app, which corrupts
 * the only signal the ramp has.
 *
 * Order is fixed. All five pills are identical apart from selection.
 */
const OPTIONS: { label: string; rating: Rating }[] = [
  { label: "Very comfortable", rating: 5 },
  { label: "Comfortable", rating: 4 },
  { label: "Just right", rating: 3 },
  { label: "Little effort", rating: 2 },
  { label: "Extra effort", rating: 1 },
];

interface Props {
  onSubmit: (r: Rating) => void;
  onBack?: () => void;
  /** Shown during onboarding only; omitted after an ordinary session. */
  progress?: number;
}

export function Vote({ onSubmit, onBack, progress }: Props) {
  useSurface("paper");
  const [chosen, setChosen] = useState<Rating | null>(null);

  return (
    <div className="screen">
      {progress !== undefined ? (
        <StepBar progress={progress} onBack={onBack} />
      ) : (
        <div className="nav" />
      )}

      <div style={{ marginTop: 32 }}>
        <h1 className="display">How did that feel?</h1>
        <p className="sub">There's no right answer. It only decides how much you get tomorrow.</p>
      </div>

      <div style={{ marginTop: 30 }}>
        {OPTIONS.map((o) => (
          <OptionPill
            key={o.rating}
            label={o.label}
            selected={chosen === o.rating}
            onSelect={() => setChosen(o.rating)}
          />
        ))}
      </div>

      <div className="grow" />
      <div className="foot">
        <Button disabled={chosen === null} onClick={() => chosen && onSubmit(chosen)}>
          Continue
        </Button>
      </div>
    </div>
  );
}
