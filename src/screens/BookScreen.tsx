import { Button } from "../components/Button";
import { Wordmark } from "../components/Wordmark";
import { useSurface } from "../hooks";
import type { JourneyStep } from "../service";

interface Props {
  bookTitle: string;
  steps: JourneyStep[];
  /** The soft line after a finished session. Never a popup, never a toast. */
  message: string | null;
  onStartChapter: (index: number) => void;
  onLibrary: () => void;
  onSettings: () => void;
}

function Mark({ state }: { state: JourneyStep["state"] }) {
  if (state === "read") {
    return (
      <span className="step__mark step__mark--read" aria-hidden="true">
        ✓
      </span>
    );
  }
  if (state === "reading") return <span className="step__mark step__mark--reading" aria-hidden="true" />;
  return <span className="step__mark" aria-hidden="true" />;
}

/**
 * THE BOOK SCREEN — the chapter journey.
 *
 * Every chapter is a place the reader can start from; the exercise does not
 * have to begin at chapter one. Three states only, exactly as the library uses:
 * tick, dot, empty ring. No percentage, no "3 of 12", no bar.
 */
export function BookScreen({
  bookTitle, steps, message, onStartChapter, onLibrary, onSettings,
}: Props) {
  useSurface("paper");

  const current = steps.find((s) => s.current) ?? steps.find((s) => s.state !== "read") ?? steps[0];

  return (
    <div className="screen">
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 0 10px", minHeight: 44,
        }}
      >
        <Wordmark />
        <nav style={{ display: "flex", gap: "var(--s-4)" }}>
          <button type="button" onClick={onLibrary}
                  style={{ fontSize: "0.8125rem", color: "var(--ink-2)", minHeight: 44 }}>
            Books
          </button>
          <button type="button" onClick={onSettings}
                  style={{ fontSize: "0.8125rem", color: "var(--ink-2)", minHeight: 44 }}>
            Settings
          </button>
        </nav>
      </header>

      {message && (
        <p className="softline rise" role="status">
          {message}
        </p>
      )}

      <h1 className="display display--sm" style={{ marginTop: message ? 0 : "var(--s-2)" }}>
        {bookTitle}
      </h1>

      {current && (
        <div style={{ marginTop: "var(--s-5)" }}>
          <Button onClick={() => onStartChapter(current.index)}>
            {current.read > 0 ? "Continue" : "Start"}
          </Button>
        </div>
      )}

      <p className="eyebrow" style={{ marginTop: "var(--s-7)" }}>Your chapters</p>

      <div className="journey">
        {steps.map((s, i) => (
          <div key={s.index} className={s.state === "unread" ? "step step--unread" : "step"}>
            <span className="step__rail">
              <span className={`step__line step__line--top${i === 0 ? " step__line--hidden" : ""}`} />
              <Mark state={s.state} />
              <span
                className={`step__line${i === steps.length - 1 ? " step__line--hidden" : ""}`}
              />
            </span>
            <button
              type="button"
              className="step__body"
              onClick={() => onStartChapter(s.index)}
              aria-label={`${s.title} — ${s.state === "read" ? "read" : s.state === "reading" ? "in progress" : "not started"}`}
            >
              <span className="step__title">{s.title}</span>
              {s.current && <span className="step__meta">You're here</span>}
            </button>
          </div>
        ))}
      </div>

      <div className="grow" />
      <div className="foot" />
    </div>
  );
}
