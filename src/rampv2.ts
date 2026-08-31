/* ============================================================================
   V2 RAMP — the chunk is measured in PARAGRAPHS.
   ----------------------------------------------------------------------------
   Everyone starts at one paragraph. Two grow-votes in a row adds one; two
   shrink-votes in a row removes one. Nothing else moves it.

   Deliberate differences from V1's applyRampA, which is untouched in core.ts:
     - paragraphs, not words, and +1/-1 rather than +12% / -15%
     - no two-session cooldown: the demo has to visibly move
     - no interlock: Ramp B (paper migration) is parked in V2

   "Just right" is the resting point: it neither grows nor shrinks, and it
   BREAKS a run, because "two in a row" has to mean two in a row.
   ========================================================================== */

import type { Rating } from "./core.js";

/** 5 Very comfortable · 4 Comfortable */
export const GROW_VOTES: readonly Rating[] = [5, 4];
/** 2 Little effort · 1 Extra effort */
export const SHRINK_VOTES: readonly Rating[] = [2, 1];

export const MIN_PARAGRAPHS = 1;
export const START_PARAGRAPHS = 1;
export const RUN_LENGTH = 2;

export interface RampState {
  /** Carries across chapters AND across books — it is a property of the reader. */
  chunkParagraphs: number;
  growRun: number;
  shrinkRun: number;
}

export const INITIAL_RAMP: RampState = {
  chunkParagraphs: START_PARAGRAPHS,
  growRun: 0,
  shrinkRun: 0,
};

export type RampChange = "up" | "down" | "hold";

export interface RampResult {
  next: RampState;
  change: RampChange;
  reason: string;
}

export function applyParagraphRamp(state: RampState, rating: Rating): RampResult {
  const grows = GROW_VOTES.includes(rating);
  const shrinks = SHRINK_VOTES.includes(rating);

  // A vote that is neither resets both runs — that is what "in a row" means.
  const growRun = grows ? state.growRun + 1 : 0;
  const shrinkRun = shrinks ? state.shrinkRun + 1 : 0;

  if (growRun >= RUN_LENGTH) {
    return {
      next: { chunkParagraphs: state.chunkParagraphs + 1, growRun: 0, shrinkRun: 0 },
      change: "up",
      reason: "two comfortable in a row",
    };
  }

  if (shrinkRun >= RUN_LENGTH) {
    const next = Math.max(MIN_PARAGRAPHS, state.chunkParagraphs - 1);
    return {
      next: { chunkParagraphs: next, growRun: 0, shrinkRun: 0 },
      change: next === state.chunkParagraphs ? "hold" : "down",
      reason:
        next === state.chunkParagraphs
          ? "already at one paragraph"
          : "two effortful in a row",
    };
  }

  return {
    next: { ...state, growRun, shrinkRun },
    change: "hold",
    reason: grows ? "one more comfortable to grow"
          : shrinks ? "one more effortful to ease off"
          : "steady",
  };
}

/* ---------------------------------------------------------- serving ------ */

export interface Serving {
  chapterIndex: number;
  from: number;
  to: number;
  paragraphs: string[];
  /** True when this chunk reaches the end of the chapter. */
  finishesChapter: boolean;
  /** Fewer paragraphs than the chunk size, because the chapter ran out. */
  clipped: boolean;
}

/**
 * A chunk NEVER crosses a chapter boundary. If the chapter has fewer
 * paragraphs left than the current chunk size, the session is simply shorter —
 * the remainder is not taken from the next chapter.
 */
export function serveParagraphs(
  paragraphs: string[],
  from: number,
  chunkParagraphs: number,
  chapterIndex: number,
): Serving {
  const start = Math.max(0, Math.min(from, paragraphs.length));
  const to = Math.min(start + Math.max(1, chunkParagraphs), paragraphs.length);
  return {
    chapterIndex,
    from: start,
    to,
    paragraphs: paragraphs.slice(start, to),
    finishesChapter: to >= paragraphs.length,
    clipped: to - start < chunkParagraphs,
  };
}
