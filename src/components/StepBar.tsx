interface Props {
  /** 0–1. A single continuous track, never segments. */
  progress: number;
  onBack?: () => void;
  onSkip?: () => void;
}

/**
 * Onboarding and setup only. Never on a reading or library screen — those must
 * carry no progress indication of any kind.
 */
export function StepBar({ progress, onBack, onSkip }: Props) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div className="nav">
      {onBack ? (
        <button type="button" className="nav__back" onClick={onBack} aria-label="Back">
          ←
        </button>
      ) : (
        <span className="nav__back" aria-hidden="true" />
      )}
      <span
        className="track"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i className="track__fill" style={{ width: `${pct}%` }} />
      </span>
      {onSkip ? (
        <button type="button" className="nav__skip" onClick={onSkip}>
          Skip
        </button>
      ) : (
        <span className="nav__skip" aria-hidden="true" />
      )}
    </div>
  );
}
