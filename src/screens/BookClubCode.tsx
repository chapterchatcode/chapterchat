import { useState } from "react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { StepBar } from "../components/StepBar";
import { useSurface } from "../hooks";

interface Props {
  onSubmit: (code: string) => void;
  onSkip: () => void;
  onBack: () => void;
}

/**
 * Shown immediately after sign-up. There is no server, so the code is stored
 * as-is and never validated — validating it would mean inventing a rule the
 * product does not have yet. Skipping is a first-class choice, not a penalty,
 * so both buttons sit together at the bottom.
 */
export function BookClubCode({ onSubmit, onSkip, onBack }: Props) {
  useSurface("paper");
  const [code, setCode] = useState("");

  const submit = () => {
    const trimmed = code.trim();
    if (trimmed) onSubmit(trimmed);
    else onSkip();
  };

  return (
    <div className="screen">
      <StepBar progress={0.1} onBack={onBack} />

      <div style={{ marginTop: 32 }}>
        <h1 className="display">Enter your Book Club Code</h1>
        <p className="sub">
          If you joined through a book club, add its code. If not, skip this — nothing changes.
        </p>
      </div>

      <div style={{ marginTop: 26 }}>
        <Input
          icon="text"
          value={code}
          onChange={setCode}
          placeholder="Book club code"
          onEnter={submit}
        />
      </div>

      <div className="grow" />
      <div className="foot">
        <Button onClick={submit}>Submit</Button>
        <Button variant="quiet" onClick={onSkip} style={{ marginTop: 6 }}>
          Skip
        </Button>
      </div>
    </div>
  );
}
