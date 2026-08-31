import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { useSurface } from "../hooks";
import type { ChapterState } from "../bookmodel";

export interface LibraryBook {
  id: string;
  title: string;
  deadline?: string;
  chapters: { index: number; title: string; state: ChapterState }[];
}

interface Props {
  books: LibraryBook[];
  onOpenBook: (id: string) => void;
  onAddBook: () => void;
  onBack: () => void;
}

/** "Finish by 24 September" — plain muted text, never a countdown. */
function humanDate(iso?: string): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `Finish by ${dt.toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" })}`;
}

/**
 * Three chapter states only: tick (read), dot (reading), nothing (unread).
 * No percentage, no "3 of 12", no bar. The deadline is inert.
 */
export function Library({ books, onOpenBook, onAddBook, onBack }: Props) {
  useSurface("paper");

  return (
    <div className="screen">
      <div className="nav">
        <button type="button" className="nav__back" onClick={onBack} aria-label="Back">←</button>
      </div>

      <div style={{ padding: "14px 0 18px" }}>
        <h1 className="display display--sm">Your books</h1>
      </div>

      {books.length === 0 ? (
        <>
          <Card>
            <h2 className="card__title">Nothing here yet.</h2>
            <p className="hint" style={{ marginTop: 6 }}>Add a book and we'll start tonight.</p>
          </Card>
          <div className="grow" />
          <div className="foot"><Button onClick={onAddBook}>Add a book</Button></div>
        </>
      ) : (
        <>
          {books.map((b) => (
            <section key={b.id} style={{ marginBottom: "var(--s-6)" }}>
              <button type="button" style={{ width: "100%", textAlign: "left" }}
                      onClick={() => onOpenBook(b.id)}>
                <Card>
                  <h2 className="card__title">{b.title}</h2>
                  {humanDate(b.deadline) && <p className="card__meta">{humanDate(b.deadline)}</p>}
                </Card>
              </button>

              <div style={{ marginTop: 14 }}>
                {b.chapters.map((c) => (
                  <div key={c.index}
                       className={c.state === "unread" ? "chapter chapter--unread" : "chapter"}>
                    <span>{c.title}</span>
                    {c.state === "read" && <span className="chapter__tick" aria-label="Read">✓</span>}
                    {c.state === "reading" && <span className="chapter__dot" aria-label="Reading" />}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="grow" />
          <div className="foot">
            <Button variant="secondary" onClick={onAddBook}>Add a book</Button>
          </div>
        </>
      )}
    </div>
  );
}
