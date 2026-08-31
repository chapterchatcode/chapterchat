/**
 * The white page physically runs out and the creme app resumes beneath it.
 * Full-bleed, filled --paper, no filter and no texture image.
 */
export function DeckleEdge() {
  return (
    <svg
      className="deckle"
      viewBox="0 0 330 13"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0,13 L0,7 C14,3 24,9 38,6 C52,3 60,8 74,7 C90,6 98,2 112,5 C126,8 136,4 150,6 C166,8 174,3 188,5 C202,7 212,9 226,6 C240,3 250,8 264,7 C278,6 288,2 302,5 C314,7 322,9 330,6 L330,13 Z"
        fill="var(--paper)"
      />
    </svg>
  );
}
