import { Button } from "../components/Button";
import { DeckleEdge } from "../components/DeckleEdge";
import { Reading } from "./Reading";

interface Props {
  title: string;
  leadIn: string | null;
  paragraphs: string[];
  /** The STARTING CUE only — one sentence. Never the offline text itself. */
  cue: string;
  pages: number;
  onRead: () => void;
  onTitle: () => void;
}

/**
 * The signature moment. The white page physically runs out at a torn deckled
 * edge and the creme app resumes beneath it, showing only where to start.
 *
 * The offline portion is never rendered here and never enters the DOM — if it
 * did, the five-word check on return would mean nothing.
 */
export function Handoff({ title, leadIn, paragraphs, cue, pages, onRead, onTitle }: Props) {
  // A cue that already opens with dialogue must not be double-quoted.
  const quoted = /^["“'‘]/.test(cue.trim()) ? cue.trim() : `“${cue.trim()}”`;
  return (
    <Reading
      title={title}
      onTitle={onTitle}
      leadIn={leadIn}
      paragraphs={paragraphs}
      tail={
        <>
          <DeckleEdge />
          <div className="handoff__lower">
            <p className="eyebrow">Continue in your book</p>
            <p className="cue">{quoted}</p>
            <p className="hint" style={{ marginTop: 14 }}>
              About {pages} more {pages === 1 ? "page" : "pages"}. Come back when you're done.
            </p>
            <p className="hint" style={{ marginTop: 6 }}>Put your phone on Do Not Disturb.</p>
            <div style={{ marginTop: 20 }}>
              <Button onClick={onRead}>I've read it</Button>
            </div>
          </div>
        </>
      }
    />
  );
}
