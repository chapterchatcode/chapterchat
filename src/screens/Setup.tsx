import { useRef, useState } from "react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { StepBar } from "../components/StepBar";
import { useSurface } from "../hooks";
import { addDays } from "../core";
import type { Chapter } from "../bookmodel";
import type { BookMeta } from "../service";

interface Props {
  today: string;
  chapters: Chapter[];
  fileName: string | null;
  fileError: string | null;
  onFile: (f: File) => void;
  onComplete: (meta: BookMeta) => void;
  onBack: () => void;
}

/**
 * Two steps in V2. The "do you have a physical copy?" step is gone along with
 * the paper migration it fed — see DECISIONS-V2.md.
 */
export function Setup({ today, chapters, fileName, fileError, onFile, onComplete, onBack }: Props) {
  useSurface("paper");
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [deadline, setDeadline] = useState(addDays(today, 90));
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const back = () => (step === 0 ? onBack() : setStep(0));

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    onFile(f);
    if (!title) setTitle(f.name.replace(/\.(txt|epub)$/i, "").replace(/[_-]+/g, " ").trim());
  };

  if (step === 0) {
    return (
      <div className="screen">
        <StepBar progress={0.7} onBack={back} />
        <div style={{ marginTop: 32 }}>
          <h1 className="display">Add your book</h1>
          <p className="sub">A .txt or .epub file. We'll find its chapters and start you off small.</p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          style={{
            marginTop: 26,
            border: `1px ${dragging ? "solid" : "dashed"} var(--rule)`,
            borderRadius: "var(--r-card)",
            padding: "var(--s-7) var(--s-5)",
            textAlign: "center",
            background: dragging ? "var(--paper-raised)" : "transparent",
            transition: "background var(--dur) var(--ease)",
          }}
        >
          <p style={{ color: "var(--ink-2)", fontSize: "0.875rem" }}>
            {fileName ?? "Drop your file here"}
          </p>
          <Button
            variant="secondary"
            style={{ marginTop: "var(--s-4)", width: "auto", padding: "12px 22px", display: "inline-block" }}
            onClick={() => input.current?.click()}
          >
            Choose a file
          </Button>
          <input
            ref={input}
            type="file"
            accept=".txt,.epub,text/plain,application/epub+zip"
            className="visually-hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        {fileError && <p className="hint hint--error" style={{ marginTop: "var(--s-3)" }}>{fileError}</p>}
        {!fileError && fileName && chapters.length > 0 && (
          <p className="hint" style={{ marginTop: "var(--s-3)" }}>
            {chapters.length === 1 ? "One chapter found." : `${chapters.length} chapters found.`}
          </p>
        )}

        <div className="grow" />
        <div className="foot">
          <Button disabled={!fileName || Boolean(fileError)} onClick={() => setStep(1)}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <StepBar progress={0.88} onBack={back} />
      <div style={{ marginTop: 32 }}>
        <h1 className="display">About this book</h1>
      </div>

      <div style={{ marginTop: 24 }}>
        <Input icon="book" value={title} onChange={setTitle} placeholder="Title" />
        <Input icon="user" value={author} onChange={setAuthor} placeholder="Author (optional)" />

        <label className="hint" style={{ display: "block", margin: "var(--s-4) 0 var(--s-2) 2px" }}>
          Finish by
        </label>
        <div className="field">
          <input className="field__input" type="date" value={deadline}
                 aria-label="Finish by" onChange={(e) => setDeadline(e.target.value)} />
        </div>

        {titleError && <p className="hint hint--error">{titleError}</p>}

        <p className="hint" style={{ marginTop: "var(--s-3)" }}>
          Dates are just for you. We never remind you about them, and they don't change how much you read.
        </p>
      </div>

      <div className="grow" />
      <div className="foot">
        <Button
          onClick={() => {
            if (!title.trim()) { setTitleError("Give the book a title to continue."); return; }
            setTitleError(null);
            onComplete({ title: title.trim(), author: author.trim() || undefined, deadline });
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

/** The one place a progress indicator is permitted: it describes a machine. */
export function Processing({ progress }: { progress: number }) {
  useSurface("paper");
  return (
    <div className="screen screen--centred">
      <div className="grow" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <p className="display" style={{ fontSize: "1.5rem", marginBottom: "var(--s-5)" }}>
          Finding the chapters in your book
        </p>
        <span className="track" style={{ maxWidth: 220, margin: "0 auto", width: "100%" }}>
          <i className="track__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      </div>
    </div>
  );
}
