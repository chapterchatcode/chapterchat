import { useRef, useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useSurface } from "../hooks";
import { TEXT_SIZES, type Theme, type TextSize } from "../prefs";

interface Props {
  theme: Theme;
  textSize: TextSize;
  bookClubCode: string | null;
  chunkParagraphs: number;
  notice: string | null;
  onTheme: (t: Theme) => void;
  onTextSize: (s: TextSize) => void;
  onBookClubCode: (c: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onSignOut: () => void;
  onDelete: () => void;
  onBack: () => void;
}

const THEMES: { label: string; value: Theme }[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ padding: "var(--s-4) 0", borderBottom: "1px solid var(--rule-soft)" }}>
      <p className="eyebrow" style={{ marginBottom: "var(--s-3)" }}>{label}</p>
      {children}
    </div>
  );
}

/**
 * V2: the track switch is gone with the paper migration it controlled.
 * The book club code is editable here since it can be skipped at sign-up.
 */
export function Settings({
  theme, textSize, bookClubCode, chunkParagraphs, notice,
  onTheme, onTextSize, onBookClubCode, onExport, onImport, onSignOut, onDelete, onBack,
}: Props) {
  useSurface("paper");
  const file = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(bookClubCode ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="screen">
      <div className="nav">
        <button type="button" className="nav__back" onClick={onBack} aria-label="Back">←</button>
      </div>

      <div style={{ padding: "14px 0 6px" }}>
        <h1 className="display display--sm">Settings</h1>
      </div>

      <Row label="Where you are">
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-2)" }}>
          You're reading {chunkParagraphs === 1 ? "one paragraph" : `${chunkParagraphs} paragraphs`} at a
          time. It grows when reading feels comfortable twice in a row.
        </p>
      </Row>

      <Row label="Text size">
        <div className="sizer" style={{ marginTop: 0 }}>
          {TEXT_SIZES.map((s) => (
            <button key={s} type="button" aria-pressed={s === textSize} onClick={() => onTextSize(s)}>
              <span style={{ fontSize: s * 0.72, fontFamily: "var(--font-read)" }}>Aa</span>
            </button>
          ))}
        </div>
      </Row>

      <Row label="Appearance">
        <div className="sizer" style={{ marginTop: 0 }}>
          {THEMES.map((t) => (
            <button key={t.value} type="button" aria-pressed={t.value === theme} onClick={() => onTheme(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Book club code">
        <Input icon="text" value={code} onChange={setCode} placeholder="Book club code"
               onEnter={() => onBookClubCode(code.trim())} />
        <Button variant="secondary" onClick={() => onBookClubCode(code.trim())}>Save code</Button>
      </Row>

      <Row label="Your data">
        <Button variant="secondary" onClick={onExport}>Export my data</Button>
        <Button variant="secondary" style={{ marginTop: "var(--s-2)" }} onClick={() => file.current?.click()}>
          Restore from file
        </Button>
        <input ref={file} type="file" accept="application/json,.json" className="visually-hidden"
               onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        <p className="hint" style={{ marginTop: "var(--s-3)" }}>
          Everything stays on this device. A backup is the only way to move it.
        </p>
        {notice && <p className="hint" style={{ marginTop: "var(--s-2)", color: "var(--ink-2)" }}>{notice}</p>}
      </Row>

      <Row label="Account">
        <Button variant="quiet" style={{ textAlign: "left", padding: "10px 0", width: "auto" }} onClick={onSignOut}>
          Sign out
        </Button>
        {confirmDelete ? (
          <div style={{ marginTop: "var(--s-2)" }}>
            <p className="hint">
              This deletes your books, your place, and your reading history on this device. It can't be undone.
            </p>
            <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
              <Button variant="secondary" onClick={onDelete}>Delete everything</Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </div>
          </div>
        ) : (
          <Button variant="quiet" style={{ textAlign: "left", padding: "10px 0", width: "auto" }}
                  onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        )}
      </Row>

      <div className="grow" />
      <div className="foot" />
    </div>
  );
}
