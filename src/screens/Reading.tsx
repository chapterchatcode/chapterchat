import { useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { useSurface, useWakeLock } from "../hooks";
import { getPrefs, setPrefs, applyPrefs, TEXT_SIZES, type TextSize } from "../prefs";

interface Props {
  title: string;
  onTitle?: () => void;
  leadIn?: string | null;
  paragraphs: string[];
  /** Replaces the inline controls — used by the handoff. */
  tail?: ReactNode;
  onDone?: () => void;
  onKeepReading?: () => void;
  doneLabel?: string;
}

/**
 * THE CORE SCREEN. Background --page. Keep it nearly empty.
 *
 * No progress bar, no percentage, no word count, no page count, no time
 * remaining, and no scrollbar — a scrollbar IS a progress indicator. Controls
 * are inline after the text, never fixed to the bottom: a persistent button is
 * a nag, an inline one is a natural end.
 */
export function Reading({
  title, onTitle, leadIn, paragraphs, tail, onDone, onKeepReading,
  doneLabel = "Done",
}: Props) {
  useSurface("page");
  useWakeLock(true);
  const [sizerOpen, setSizerOpen] = useState(false);
  const [size, setSize] = useState<TextSize>(getPrefs().textSize);

  const choose = (s: TextSize) => {
    setSize(s);
    setPrefs({ textSize: s });
    applyPrefs();
  };

  return (
    <div className="screen screen--page reader">
      <div className="reader__top">
        <button type="button" className="reader__title" onClick={onTitle} disabled={!onTitle}>
          {title}
        </button>
        <button
          type="button"
          className="reader__aa"
          onClick={() => setSizerOpen((v) => !v)}
          aria-label="Text size"
          aria-expanded={sizerOpen}
        >
          Aa
        </button>
      </div>

      {leadIn && <p className="leadin">{leadIn}</p>}

      <div className="read">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {tail ?? (
        <div className="reader__end foot">
          <p className="hint" style={{ marginBottom: "var(--s-4)" }}>
            Put your phone on Do Not Disturb.
          </p>
          {onDone && <Button onClick={onDone}>{doneLabel}</Button>}
          {onKeepReading && (
            <Button variant="quiet" onClick={onKeepReading} style={{ marginTop: 6 }}>
              Keep reading
            </Button>
          )}
        </div>
      )}

      {!tail && <div className="reader__fade" aria-hidden="true" />}

      {sizerOpen && (
        <>
          <div className="scrim" onClick={() => setSizerOpen(false)} />
          <div className="sheet rise" role="dialog" aria-label="Text size">
            <p className="eyebrow">Text size</p>
            <div className="sizer">
              {TEXT_SIZES.map((s) => (
                <button key={s} type="button" aria-pressed={s === size} onClick={() => choose(s)}>
                  <span style={{ fontSize: s * 0.72, fontFamily: "var(--font-read)" }}>Aa</span>
                </button>
              ))}
            </div>
            <Button variant="quiet" onClick={() => setSizerOpen(false)} style={{ marginTop: 8 }}>
              Close
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
