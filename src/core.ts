/* ============================================================================
   READING STAMINA APP — CORE DOMAIN LOGIC
   ----------------------------------------------------------------------------
   Every function here is PURE: data in, data out, no IndexedDB, no DOM, no
   clock reads except where `now` is passed in. That is deliberate — it makes
   the rules testable, and it keeps the storage layer replaceable.

   This file is the source of truth for behaviour. `db.ts` only persists what
   these functions return.
   ========================================================================== */

/* ---------------------------------------------------------------- types -- */

export type Rating = 1 | 2 | 3 | 4 | 5;   // 1 Extra effort … 5 Very comfortable
export type Track = "paper" | "screen";
export type BookStatus = "reading" | "paused" | "finished" | "abandoned";

export type EventType =
  | "article_completed" | "chunk_served" | "chunk_completed" | "chunk_abandoned"
  | "keep_reading" | "offline_verified" | "offline_failed"
  | "portion_changed" | "stage_changed"
  | "book_started" | "book_finished" | "book_abandoned" | "graduated";

export interface ReadingEvent {
  id: string;
  type: EventType;
  bookId?: string;
  sessionId?: string;
  occurredAt: string;          // ISO 8601
  localDate: string;           // YYYY-MM-DD, FROZEN at write time
  payload: Record<string, any>;
}

export interface AppSession {
  id: string;
  bookId?: string;
  startedAt: string;
  lastBeatAt: string;
  endedAt?: string;
  localDate: string;
  activeSeconds: number;       // summed from heartbeats, never end-start
}

export interface Profile {
  timezone: string;            // IANA
  dayRolloverHour: number;     // default 4
  calibrationRating?: Rating;
  calibrationWpm?: number;
  observedWpm?: number;        // rolling median, needs >= 5 samples
  wpmSamples: number[];
  track: Track;
  graduatedAt?: string;
  createdAt: string;
}

export interface Block {
  i: number;
  text: string;
  words: number;
  startWord: number;           // cumulative offset
  tags: string[];              // chapter_start | scene_divider | section_head | verse | list | quote
}

export interface Chapter {
  index: number;
  title: string;
  startBlock: number;
  endBlock: number;
  startWord: number;
  endWord: number;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  format: "txt" | "epub";
  totalWords: number;
  blocks: Block[];
  chapters: Chapter[];
  boundaries: Record<number, number[]>;   // bucketIndex -> block indices
  createdAt: string;
}

export interface UserBook {
  bookId: string;
  status: BookStatus;
  cursorBlock: number;
  cursorWord: number;
  baselineWords: number;       // size this book STARTED at; never changes
  portionWords: number;        // live Ramp A value
  sessionsSincePortionChange: number;
  portionChangedAt?: string;
  offlineStage: number;        // 0..7
  stageSuccessCount: number;
  stageChangedAt?: string;
  deadline?: string;           // cosmetic only
  chapterDeadlines: Record<number, string>;
  startedAt: string;
  lastReadAt?: string;
  finishedAt?: string;
}

/* ------------------------------------------------------- dates & rollover */

/**
 * A "day" ends at the rollover hour (default 4am), not midnight. Someone
 * reading at 00:30 has not started a new day in any sense they'd recognise.
 * Frozen at write time — never recompute, or a change of timezone rewrites
 * the user's history.
 */
export function localDateOf(at: Date, tz: string, rolloverHour: number): string {
  const shifted = new Date(at.getTime() - rolloverHour * 3600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(shifted);
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------- wpm */

export const DEFAULT_WPM = 200;

/** Rolling median once there are >= 5 samples; calibration until then. */
export function effectiveWpm(p: Profile): number {
  if (p.wpmSamples.length >= 5) {
    const s = [...p.wpmSamples].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  return p.calibrationWpm ?? DEFAULT_WPM;
}

export function thirtyMinuteWords(p: Profile): number {
  return Math.round(effectiveWpm(p) * 30);
}

/* --------------------------------------------------------- calibration -- */

export const CALIBRATION_PORTION: Record<Rating, number> = {
  5: 900,   // Very comfortable
  4: 700,   // Comfortable
  3: 550,   // Just right
  2: 400,   // Little effort
  1: 250,   // Extra effort
};

/* ------------------------------------------------------------- buckets -- */

export const BUCKETS = [
  250, 300, 360, 430, 520, 620, 750, 900, 1080, 1300,
  1560, 1870, 2250, 2700, 3250, 3900, 4700, 5600, 6700,
];

export function bucketFor(words: number): number {
  let best = 0, bestD = Infinity;
  BUCKETS.forEach((b, i) => {
    const d = Math.abs(Math.log(b) - Math.log(words));
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/* -------------------------------------------------------------- Ramp A -- */

export interface RampAInput {
  ub: UserBook;
  rating: Rating;
  abandoned: boolean;
  /** ratings of prior completed sessions, most recent first */
  history: Rating[];
  now: Date;
}
export type RampAResult = { portionWords: number; change: "up" | "down" | "hold"; reason: string };

const RAMP_UP = 1.12, RAMP_DOWN = 0.85, INTERLOCK_DAYS = 7;

export function applyRampA(inp: RampAInput): RampAResult {
  const { ub, abandoned, history, now } = inp;
  // Behaviour overrides self-report: an abandoned session is Extra effort.
  const rating: Rating = abandoned ? 1 : inp.rating;
  const hold = (reason: string): RampAResult =>
    ({ portionWords: ub.portionWords, change: "hold", reason });

  // Invariant: only one ramp moves per week.
  if (ub.stageChangedAt &&
      now.getTime() - Date.parse(ub.stageChangedAt) < INTERLOCK_DAYS * 86400_000) {
    return hold("interlock: stage changed within 7 days");
  }
  // At most one size change per two completed sessions.
  if (ub.sessionsSincePortionChange < 2) return hold("cooldown: <2 sessions since last change");

  const prev = history[0];
  if (rating >= 4 && prev !== undefined && prev >= 4) {
    return { portionWords: Math.round(ub.portionWords * RAMP_UP), change: "up",
             reason: "two consecutive comfortable" };
  }
  if (rating === 1 && prev === 1) {
    return { portionWords: Math.round(ub.portionWords * RAMP_DOWN), change: "down",
             reason: "two consecutive extra effort" };
  }
  return hold(rating === 3 || rating === 2 ? "in flow: plateau" : "awaiting confirmation");
}

/* -------------------------------------------------------------- Ramp B -- */

export const STAGE_IN_APP_SHARE: Record<number, number | "all" | "none"> = {
  0: "all", 1: "all-but-last-para", 2: "all-but-last-para",
  3: 0.75, 4: 0.5, 5: 0.25, 6: "none", 7: "none",
} as any;

export function successesNeeded(stage: number): number {
  return stage <= 2 ? 3 : 4;
}

export interface RampBInput { ub: UserBook; track: Track; rating: Rating; verified: boolean; now: Date; }
export type RampBResult = { offlineStage: number; successCount: number; advanced: boolean; reason: string };

export function applyRampB(inp: RampBInput): RampBResult {
  const { ub, track, rating, verified, now } = inp;
  const keep = (reason: string, count = ub.stageSuccessCount): RampBResult =>
    ({ offlineStage: ub.offlineStage, successCount: count, advanced: false, reason });

  if (track !== "paper") return keep("screen track: Ramp B does not run");
  if (ub.offlineStage >= 7) return keep("at final stage");
  if (!verified || rating < 3) return keep("not a qualifying log", ub.stageSuccessCount);

  if (ub.portionChangedAt &&
      now.getTime() - Date.parse(ub.portionChangedAt) < INTERLOCK_DAYS * 86400_000) {
    return keep("interlock: portion changed within 7 days", ub.stageSuccessCount + 1);
  }

  const count = ub.stageSuccessCount + 1;
  if (count >= successesNeeded(ub.offlineStage)) {
    return { offlineStage: ub.offlineStage + 1, successCount: 0, advanced: true,
             reason: "stage complete" };
  }
  return keep("progressing", count);
}

/* --------------------------------------------------------- graduation --- */

/**
 * SEVEN qualifying days inside ANY rolling 14 calendar days.
 * Deliberately NOT a streak: a missed night must never reset progress,
 * because that is the shame spiral this product exists to prevent.
 */
export const QUALIFYING_DAYS_REQUIRED = 7;
export const GRADUATION_WINDOW_DAYS = 14;

export function qualifyingDays(
  events: ReadingEvent[], sessions: AppSession[], thirtyMinWords: number,
): Set<string> {
  const days = new Set<string>();
  for (const e of events) {
    if (e.type === "offline_verified" && (e.payload.wordsRead ?? 0) >= thirtyMinWords) {
      days.add(e.localDate);
    }
  }
  for (const s of sessions) {
    if (s.activeSeconds >= 1800) days.add(s.localDate);
  }
  return days;
}

export function graduationProgress(
  events: ReadingEvent[], sessions: AppSession[], p: Profile, today: string,
): { days: number; eligible: boolean; window: string[] } {
  const all = qualifyingDays(events, sessions, thirtyMinuteWords(p));
  const from = addDays(today, -(GRADUATION_WINDOW_DAYS - 1));
  const window = [...all].filter(d => d >= from && d <= today).sort();
  return { days: window.length, eligible: window.length >= QUALIFYING_DAYS_REQUIRED, window };
}

/* --------------------------------------------------------- next book ---- */

export function nextBookStart(
  prev: UserBook | null, graduated: boolean, hasPhysicalCopy: boolean,
  calibration: number,
): { baselineWords: number; offlineStage: number; track: Track } {
  if (!prev) {
    return { baselineWords: calibration, offlineStage: 0,
             track: hasPhysicalCopy ? "paper" : "screen" };
  }
  if (graduated) {
    // 80% of the graduated size absorbs a new book's unfamiliarity without
    // pretending their stamina evaporated.
    return {
      baselineWords: Math.round(prev.portionWords * 0.8),
      offlineStage: hasPhysicalCopy ? 6 : 0,
      track: hasPhysicalCopy ? "paper" : "screen",
    };
  }
  // Abandoned: small ratchet up from where the last book began.
  return { baselineWords: Math.round(prev.baselineWords * 1.25), offlineStage: 0,
           track: hasPhysicalCopy ? "paper" : "screen" };
}

/* ------------------------------------------------------------ chunking -- */

const CONNECTIVES = /^(however|but|so|thus|meanwhile|then|therefore|yet|still|and|nevertheless)\b/i;
const LEAD_PRONOUN = /^(she|he|it|this|that|they|there|these|those)\b/i;
const CHAPTER_LINE = /^\s*(chapter|part|book)\s+([\divxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
const SCENE_DIVIDER = /^\s*([*#•~\-—]\s*){3,}\s*$/;

export function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Layer 0: plain text -> tagged paragraph stream. */
export function parseText(raw: string): Block[] {
  const paras = raw.replace(/\r\n/g, "\n").split(/\n\s*\n/)
    .map(t => t.trim()).filter(Boolean);
  const out: Block[] = [];
  let cum = 0;
  for (const text of paras) {
    const tags: string[] = [];
    if (CHAPTER_LINE.test(text) && countWords(text) <= 8) tags.push("chapter_start");
    else if (SCENE_DIVIDER.test(text)) tags.push("scene_divider");
    else if (countWords(text) <= 8 && text === text.toUpperCase() && /[A-Z]/.test(text))
      tags.push("section_head");
    if (/^["“'']/.test(text)) tags.push("quote_open");
    if (/^\s*(\d+[.)]|[-*•])\s+/.test(text)) tags.push("list");
    const words = countWords(text);
    out.push({ i: out.length, text, words, startWord: cum, tags });
    cum += words;
  }
  return out;
}

/** Layer 1: merge indivisible atoms so a cut can never land inside one. */
export function buildBlocks(paras: Block[]): Block[] {
  const merged: Block[] = [];
  let i = 0;
  const push = (group: Block[]) => {
    const first = group[0];
    merged.push({
      i: merged.length,
      text: group.map(g => g.text).join("\n\n"),
      words: group.reduce((a, g) => a + g.words, 0),
      startWord: first.startWord,
      tags: [...new Set(group.flatMap(g => g.tags))],
    });
  };
  const HEADING = ["chapter_start", "section_head", "scene_divider"];
  while (i < paras.length) {
    const group = [paras[i]];
    // A heading or divider is not independently readable. Merge it forward
    // into the block it introduces, so the chapter boundary sits at a real
    // paragraph and the orphan penalty never fires on a two-word title.
    while (paras[i].tags.some(t => HEADING.includes(t)) && i + 1 < paras.length) {
      i++; group.push(paras[i]);
      if (!paras[i].tags.some(t => HEADING.includes(t))) break;
    }
    const isDialogue = paras[i].tags.includes("quote_open");
    const isList = paras[i].tags.includes("list");
    if (isDialogue || isList) {
      let j = i + 1;
      while (j < paras.length) {
        const p = paras[j];
        const same = isList ? p.tags.includes("list")
                            : (p.tags.includes("quote_open") || p.words <= 40);
        if (!same) break;
        group.push(p); j++;
      }
      i = j;
    } else i++;
    push(group);
  }
  return merged;
}

/** Layer 2: cut cost per gap. Low is good. Structural + penalties only. */
export function scoreGaps(blocks: Block[]): number[] {
  const cost: number[] = new Array(blocks.length + 1).fill(10);
  cost[0] = 0; cost[blocks.length] = 0;
  for (let g = 1; g < blocks.length; g++) {
    const next = blocks[g];
    let c = 10;
    if (next.tags.includes("chapter_start")) c = 0;
    else if (next.tags.includes("scene_divider")) c = 1;
    else if (next.tags.includes("section_head")) c = 2;

    const head = next.text.trimStart();
    if (CONNECTIVES.test(head)) c += 12;
    else if (LEAD_PRONOUN.test(head)) c += 10;
    if (/^["“'']/.test(head) && !/\b(said|asked|replied)\b/i.test(head.slice(0, 120))) c += 15;

    const prevText = blocks[g - 1].text.trimEnd();
    if (/[:—–]$|the following$/i.test(prevText)) c += 20;
    // Orphan penalty, but never against a structural boundary — a short
    // block that opens a chapter is not an orphan.
    const structural = next.tags.some(t =>
      t === "chapter_start" || t === "scene_divider" || t === "section_head");
    if (next.words < 25 && !structural) c += 5;

    cost[g] = Math.max(0, c);
  }
  return cost;
}

/**
 * Layer 3: choose boundaries for the whole book by dynamic programming.
 * Global, not greedy — so no chunk ends on a stub and chapters aren't
 * straddled. Structurally this is Knuth-Plass with blocks in place of words.
 */
export const ALPHA = 300;

export function solveBoundaries(blocks: Block[], cut: number[], target: number): number[] {
  const n = blocks.length;
  const W: number[] = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) W[i + 1] = W[i] + blocks[i].words;

  const lenCost = (L: number) => ALPHA * Math.pow((L - target) / target, 2);
  const MIN = 0.45 * target, MAX = 1.8 * target;

  const f = new Array(n + 1).fill(Infinity);
  const back = new Array(n + 1).fill(-1);
  f[0] = 0;

  for (let j = 1; j <= n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const L = W[j] - W[i];
      if (L > MAX) break;
      if (L < MIN && j < n) continue;        // final chunk may undershoot
      if (f[i] === Infinity) continue;
      const c = f[i] + lenCost(L) + (j < n ? cut[j] : 0);
      if (c < f[j]) { f[j] = c; back[j] = i; }
    }
    if (f[j] === Infinity && j === n) {      // degenerate: single tiny book
      f[j] = lenCost(W[j]); back[j] = 0;
    }
  }

  const out: number[] = [];
  let j = n;
  while (j > 0 && back[j] >= 0) { out.push(j); j = back[j]; }
  out.push(0);
  return out.reverse();
}

/** Layer 4: cheap assertions. Sustained failures mean ingestion is broken. */
export function validateBoundaries(
  blocks: Block[], bounds: number[], target: number,
): { ok: boolean; problems: string[]; chapterAlignment: number } {
  const problems: string[] = [];
  const W: number[] = [0];
  blocks.forEach(b => W.push(W[W.length - 1] + b.words));

  for (let k = 1; k < bounds.length; k++) {
    const L = W[bounds[k]] - W[bounds[k - 1]];
    if (L < 0.45 * target && k < bounds.length - 1)
      problems.push(`chunk ${k} is ${L}w, below floor`);
    if (L > 1.8 * target) problems.push(`chunk ${k} is ${L}w, above ceiling`);
  }
  const chapterGaps = blocks
    .map((b, i) => (b.tags.includes("chapter_start") ? i : -1))
    .filter(i => i > 0);
  const hit = chapterGaps.filter(i => bounds.includes(i)).length;
  const alignment = chapterGaps.length ? hit / chapterGaps.length : 1;
  if (chapterGaps.length >= 3 && alignment < 0.6)
    problems.push(`chapter alignment ${(alignment * 100).toFixed(0)}% below 60% floor`);

  return { ok: problems.length === 0, problems, chapterAlignment: alignment };
}

export function detectChapters(blocks: Block[]): Chapter[] {
  const starts = blocks.map((b, i) => (b.tags.includes("chapter_start") ? i : -1)).filter(i => i >= 0);
  if (starts.length === 0) return [];
  const W: number[] = [0];
  blocks.forEach(b => W.push(W[W.length - 1] + b.words));
  return starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : blocks.length;
    return {
      index: k + 1,
      title: blocks[s].text.split("\n")[0].slice(0, 80),
      startBlock: s, endBlock: end - 1, startWord: W[s], endWord: W[end],
    };
  });
}

export function chapterStatus(c: Chapter, cursorWord: number): "read" | "reading" | "unread" {
  if (cursorWord >= c.endWord) return "read";
  if (cursorWord > c.startWord) return "reading";
  return "unread";
}

/* --------------------------------------------------- serving tonight ---- */

/** Snap forward to the next real boundary. Never re-solve from an arbitrary point. */
export function nextBoundary(bounds: number[], cursorBlock: number, blocks: Block[], target: number): number {
  const W: number[] = [0];
  blocks.forEach(b => W.push(W[W.length - 1] + b.words));
  for (const b of bounds) {
    if (b <= cursorBlock) continue;
    if (W[b] - W[cursorBlock] < 0.5 * target && b !== bounds[bounds.length - 1]) continue;
    return b;
  }
  return blocks.length;
}

/** How the day's portion splits between screen and paper. */
export function splitForStage(
  blocks: Block[], from: number, to: number, stage: number,
): { inAppTo: number; offlineFrom: number } {
  if (stage <= 0) return { inAppTo: to, offlineFrom: to };
  if (stage >= 6) return { inAppTo: from, offlineFrom: from };
  if (stage <= 2) return { inAppTo: Math.max(from + 1, to - 1), offlineFrom: Math.max(from + 1, to - 1) };
  const share = stage === 3 ? 0.75 : stage === 4 ? 0.5 : 0.25;
  const W: number[] = [0];
  blocks.forEach(b => W.push(W[W.length - 1] + b.words));
  const total = W[to] - W[from];
  const cutAt = W[from] + total * share;
  let best = from + 1;
  for (let i = from + 1; i < to; i++) if (Math.abs(W[i] - cutAt) < Math.abs(W[best] - cutAt)) best = i;
  return { inAppTo: best, offlineFrom: best };
}

/* ------------------------------------------------------ five-word check -- */

export function normalizeWords(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
                          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/**
 * Confirms the offline read happened AND reveals how far they got.
 * Searches ONLY a window around the expected stop point — common phrases
 * repeat, and matching the first occurrence in the file would corrupt Ramp A.
 * Fuzzy per word so a typo never fails an honest reader.
 */
export function verifyFiveWords(
  bookWords: string[], typed: string, expectedWordPos: number, windowWords: number,
): { matched: boolean; wordsRead: number; position: number } {
  const needle = normalizeWords(typed);
  if (needle.length === 0) return { matched: false, wordsRead: 0, position: -1 };

  const lo = Math.max(0, expectedWordPos - windowWords);
  const hi = Math.min(bookWords.length, expectedWordPos + windowWords);

  let best = -1, bestScore = Infinity;
  for (let i = lo; i + needle.length <= hi; i++) {
    let score = 0;
    for (let k = 0; k < needle.length; k++) {
      score += editDistance(needle[k], bookWords[i + k]);
      if (score > 2) break;
    }
    if (score <= 2 && score < bestScore) { bestScore = score; best = i; }
    if (score === 0) break;
  }
  if (best < 0) return { matched: false, wordsRead: 0, position: -1 };
  const end = best + needle.length;
  return { matched: true, wordsRead: end, position: end };
}
