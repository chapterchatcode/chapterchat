import { useState } from "react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useSurface } from "../hooks";

interface Props {
  onLog: (typed: string) => boolean;   // returns whether it matched
  onAccept: (typed: string) => void;   // second attempt: accepted regardless
  onDidNotRead: () => void;
  onBack: () => void;
}

/**
 * One input, two jobs: it confirms the reading happened, and it locates how far
 * they got — which feeds Ramp A without asking another question.
 *
 * This is an HONESTY AID, NOT SECURITY. Someone determined to cheat has the
 * file. That is fine. So: one retry, then accept, and never the words
 * "incorrect", "failed", "invalid" or "wrong".
 */
export function OfflineLog({ onLog, onAccept, onDidNotRead, onBack }: Props) {
  useSurface("paper");
  const [typed, setTyped] = useState("");
  const [retried, setRetried] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = () => {
    if (!typed.trim()) {
      setNotice("Type the last few words to log it.");
      return;
    }
    if (retried) {
      onAccept(typed);
      return;
    }
    const matched = onLog(typed);
    if (!matched) {
      setRetried(true);
      setNotice("We couldn't place those words. Try the last few again?");
      setTyped("");
    }
  };

  return (
    <div className="screen">
      <div className="nav">
        <button type="button" className="nav__back" onClick={onBack} aria-label="Back">←</button>
      </div>

      <div style={{ marginTop: 32 }}>
        <h1 className="display">Welcome back</h1>
        <p className="sub">Type the last five words you read. It's how we know where you got to.</p>
      </div>

      <div style={{ marginTop: 26 }}>
        <Input icon="text" value={typed} onChange={setTyped}
               placeholder="Last five words" onEnter={submit} />
        <p className="hint">Punctuation and capitals don't matter.</p>
        {notice && <p className="hint" style={{ marginTop: "var(--s-2)", color: "var(--ink-2)" }}>{notice}</p>}
      </div>

      <div className="grow" />
      <div className="foot">
        <Button onClick={submit}>Log it</Button>
        <Button variant="quiet" onClick={onDidNotRead} style={{ marginTop: 6 }}>
          I didn't read
        </Button>
      </div>
    </div>
  );
}
