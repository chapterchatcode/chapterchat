import { useId, useState } from "react";

type Icon = "user" | "mail" | "lock" | "book" | "text";

interface Props {
  icon?: Icon;
  type?: "text" | "email" | "password" | "date";
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  autoComplete?: string;
  inputMode?: "text" | "email";
  onEnter?: () => void;
}

/** 15px leading glyph in --ink-3. Stroked, monochrome, never filled. */
function Glyph({ name }: { name: Icon }) {
  const common = {
    className: "field__icon",
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "user":
      return (
        <svg {...common}>
          <circle cx="8" cy="5.2" r="2.6" />
          <path d="M2.6 13.6c0-2.6 2.4-4.2 5.4-4.2s5.4 1.6 5.4 4.2" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" />
          <path d="M2.4 4.6 8 8.8l5.6-4.2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="10" height="6.6" rx="1.6" />
          <path d="M5.4 7V5.4a2.6 2.6 0 0 1 5.2 0V7" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M2.6 3.2h4.2c.9 0 1.6.7 1.6 1.6v8.4c0-.7-.6-1.2-1.3-1.2H2.6z" />
          <path d="M13.4 3.2H9.2c-.9 0-1.6.7-1.6 1.6v8.4c0-.7.6-1.2 1.3-1.2h4.5z" />
        </svg>
      );
    case "text":
      return (
        <svg {...common}>
          <path d="M3 4.2h10M3 8h10M3 11.8h6" />
        </svg>
      );
  }
}

export function Input({
  icon, type = "text", value, onChange, placeholder, error,
  autoComplete, inputMode, onEnter,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const isPassword = type === "password";
  const resolved = isPassword && revealed ? "text" : type;

  return (
    <div>
      <div className={error ? "field field--error" : "field"}>
        {icon && <Glyph name={icon} />}
        <input
          id={id}
          className="field__input"
          type={resolved}
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
        />
        {isPassword && (
          <button
            type="button"
            className="field__reveal"
            aria-label={revealed ? "Hide password" : "Show password"}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error && <p className="hint hint--error" style={{ margin: "-4px 0 11px 2px" }}>{error}</p>}
    </div>
  );
}
