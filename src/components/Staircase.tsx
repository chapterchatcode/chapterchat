/**
 * The flow channel, climbed as a staircase: vertical step, horizontal plateau,
 * never a diagonal. Drawn exactly once, on the graduation screen, as the shape
 * of what they did. It must NEVER appear as a live progress indicator.
 */
export function Staircase() {
  return (
    <svg
      width="150"
      height="72"
      viewBox="0 0 150 72"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ marginBottom: "34px" }}
    >
      <path
        d="M2,70 L26,70 L26,56 L50,56 L50,42 L74,42 L74,28 L98,28 L98,14 L122,14 L122,2 L146,2"
        stroke="var(--ink)"
        strokeWidth="1.25"
        strokeLinecap="square"
        opacity="0.85"
      />
    </svg>
  );
}
