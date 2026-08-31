/* ============================================================================
   SERVICE (V2) — orchestration only.
   ----------------------------------------------------------------------------
   The ramp rules live in rampv2.ts; dates, WPM and graduation still come from
   core.ts, which is untouched. This file only calls them at the right moments
   and persists what they return.
   ========================================================================== */

import {
  effectiveWpm, graduationProgress, localDateOf, thirtyMinuteWords,
  type Profile, type Rating, type ReadingEvent,
} from "./core.js";
import { chapterState, type Chapter, type ChapterState, type ParsedBook } from "./bookmodel.js";
import { applyParagraphRamp, serveParagraphs, type RampState, type Serving } from "./rampv2.js";
import {
  allEvents, allSessions, currentBook, getProfile, getRamp, putBook, putProfile,
  putProgress, putRamp, recordEvent, uid,
  type Progress, type StoredBook,
} from "./storage.js";

/* ---------------------------------------------------------------- ingest -- */

export interface BookMeta {
  title: string;
  author?: string;
  deadline?: string;
}

export async function createBook(parsed: ParsedBook, meta: BookMeta): Promise<{
  book: StoredBook; progress: Progress;
}> {
  const now = new Date().toISOString();
  const book: StoredBook = {
    id: uid("book"),
    title: meta.title,
    author: meta.author,
    format: parsed.format,
    chapters: parsed.chapters,
    deadline: meta.deadline,
    createdAt: now,
  };
  const progress: Progress = {
    bookId: book.id,
    status: "reading",
    chapterIndex: 1,
    read: {},
    startedAt: now,
  };
  await putBook(book);
  await putProgress(progress);
  await recordEvent({ type: "book_started", bookId: book.id });
  return { book, progress };
}

/* -------------------------------------------------------- serving tonight */

export interface Session {
  chapter: Chapter;
  serving: Serving;
  /** Verbatim tail of the previous paragraph. Context, never a summary. */
  leadIn: string | null;
  chunkParagraphs: number;
}

const FOUR_HOURS = 4 * 3600_000;

function lastSentences(text: string, count: number): string {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["'”’]?/g);
  if (!parts || parts.length === 0) return text.trim().slice(-200);
  return parts.slice(-count).join(" ").trim();
}

export function chapterOf(book: StoredBook, index: number): Chapter {
  return book.chapters.find((c) => c.index === index) ?? book.chapters[0];
}

export function planSession(
  book: StoredBook,
  progress: Progress,
  ramp: RampState,
  now = new Date(),
): Session {
  const chapter = chapterOf(book, progress.chapterIndex);
  const from = progress.read[chapter.index] ?? 0;
  const serving = serveParagraphs(chapter.paragraphs, from, ramp.chunkParagraphs, chapter.index);

  const readRecently = progress.lastReadAt
    ? now.getTime() - Date.parse(progress.lastReadAt) < FOUR_HOURS
    : false;
  const leadIn =
    from > 0 && !readRecently ? lastSentences(chapter.paragraphs[from - 1], 1) : null;

  return { chapter, serving, leadIn, chunkParagraphs: ramp.chunkParagraphs };
}

export async function serveChunkEvent(book: StoredBook, s: Session): Promise<void> {
  await recordEvent({
    type: "chunk_served",
    bookId: book.id,
    payload: {
      chapter: s.chapter.index,
      from: s.serving.from,
      to: s.serving.to,
      paragraphs: s.serving.paragraphs.length,
      chunkParagraphs: s.chunkParagraphs,
      words: s.serving.paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
    },
  });
}

/* --------------------------------------------------------- finishing ----- */

export interface CompletionResult {
  progress: Progress;
  ramp: RampState;
  change: "up" | "down" | "hold";
  /** The soft line shown back on the book screen. Never a popup. */
  message: string;
}

/**
 * One completed session: log it, advance the cursor inside the chapter, move
 * the ramp. The chunk never spills into the next chapter, so finishing a
 * chapter simply moves the reader to the next unread one.
 */
export async function completeSession(
  book: StoredBook,
  progress: Progress,
  session: Session,
  rating: Rating,
  dwellSeconds: number,
): Promise<CompletionResult> {
  const now = new Date();
  const words = session.serving.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;

  await recordEvent({
    type: "chunk_completed",
    bookId: book.id,
    payload: {
      chapter: session.chapter.index,
      words,
      paragraphs: session.serving.paragraphs.length,
      dwellSeconds,
      rating,
    },
  });
  await maybeRecordWpmSample(words, dwellSeconds);

  const read = { ...progress.read, [session.chapter.index]: session.serving.to };
  let chapterIndex = session.chapter.index;

  if (session.serving.finishesChapter) {
    const nextUnread = book.chapters.find((c) => (read[c.index] ?? 0) < c.paragraphs.length);
    if (nextUnread) chapterIndex = nextUnread.index;
  }

  let next: Progress = {
    ...progress,
    read,
    chapterIndex,
    lastReadAt: now.toISOString(),
  };

  const done = book.chapters.every((c) => (read[c.index] ?? 0) >= c.paragraphs.length);
  if (done) {
    next = { ...next, status: "finished", finishedAt: now.toISOString() };
    await recordEvent({ type: "book_finished", bookId: book.id });
  }
  await putProgress(next);

  const before = await getRamp();
  const result = applyParagraphRamp(before, rating);
  await putRamp(result.next);
  if (result.change !== "hold") {
    await recordEvent({
      type: "portion_changed",
      bookId: book.id,
      payload: {
        from: before.chunkParagraphs,
        to: result.next.chunkParagraphs,
        reason: result.reason,
      },
    });
  }

  return {
    progress: next,
    ramp: result.next,
    change: result.change,
    message: completionMessage(result.change, result.next.chunkParagraphs, session.serving.finishesChapter),
  };
}

/**
 * The soft line on return. Warm, quiet, and never a modal — it sits in the
 * page and fades in, so it can be ignored.
 */
export function completionMessage(
  change: "up" | "down" | "hold",
  chunkParagraphs: number,
  finishedChapter: boolean,
): string {
  const size = chunkParagraphs === 1 ? "one paragraph" : `${chunkParagraphs} paragraphs`;
  if (change === "up") return `Way to go! Next time we'll give you ${size}.`;
  if (change === "down") return `Way to go! We'll ease back to ${size} next time.`;
  if (finishedChapter) return "Way to go! That's the chapter done.";
  return "Way to go!";
}

async function maybeRecordWpmSample(words: number, seconds: number): Promise<void> {
  if (words < 60 || seconds < 20) return;
  const wpm = Math.round((words / seconds) * 60);
  if (wpm < 60 || wpm > 900) return;
  const p = await getProfile();
  if (!p) return;
  const samples = [...p.wpmSamples, wpm].slice(-15);
  await putProfile({ ...p, wpmSamples: samples, observedWpm: effectiveWpm({ ...p, wpmSamples: samples }) });
}

export async function abandonSession(book: StoredBook, session: Session): Promise<void> {
  await recordEvent({
    type: "chunk_abandoned",
    bookId: book.id,
    payload: { chapter: session.chapter.index, wordsReached: 0 },
  });
}

/* ------------------------------------------------------- chapter journey - */

export interface JourneyStep {
  index: number;
  title: string;
  state: ChapterState;
  paragraphs: number;
  read: number;
  current: boolean;
}

export function journey(book: StoredBook, progress: Progress): JourneyStep[] {
  return book.chapters.map((c) => {
    const read = progress.read[c.index] ?? 0;
    return {
      index: c.index,
      title: c.title,
      state: chapterState(c, read),
      paragraphs: c.paragraphs.length,
      read,
      current: c.index === progress.chapterIndex,
    };
  });
}

/** Jumping to a chapter from the journey. Reading may start anywhere. */
export async function selectChapter(progress: Progress, chapterIndex: number): Promise<Progress> {
  const next = { ...progress, chapterIndex };
  await putProgress(next);
  return next;
}

/* --------------------------------------------------------- graduation ---- */

export async function checkGraduation(profile: Profile): Promise<{
  days: number; eligible: boolean; alreadyGraduated: boolean;
}> {
  const [events, sessions] = await Promise.all([allEvents(), allSessions()]);
  const today = localDateOf(new Date(), profile.timezone, profile.dayRolloverHour);
  const p = graduationProgress(events, sessions, profile, today);
  return { days: p.days, eligible: p.eligible, alreadyGraduated: Boolean(profile.graduatedAt) };
}

export async function graduate(profile: Profile, days: number): Promise<Profile> {
  const cur = await currentBook();
  await recordEvent({
    type: "graduated",
    bookId: cur?.book.id,
    payload: { track: profile.track, qualifyingDays: days },
  });
  const next = { ...profile, graduatedAt: new Date().toISOString() };
  await putProfile(next);
  return next;
}

export function thirtyMinuteTarget(profile: Profile): number {
  return thirtyMinuteWords(profile);
}

/* -------------------------------------------------------------- debug ---- */

export interface FunnelStats {
  signedUp: boolean;
  articleDone: boolean;
  dayOne: boolean;
  graduated: boolean;
  qualifyingDaysLast14: number;
  chunkParagraphs: number;
  growRun: number;
  shrinkRun: number;
  bookClubCode: string | null;
  chapters: number;
  rampHistory: { at: string; from: number; to: number; reason: string }[];
  events: number;
}

export async function funnel(profile: Profile | undefined, bookClubCode: string | null): Promise<FunnelStats> {
  const [events, sessions, ramp, cur] = await Promise.all([
    allEvents(), allSessions(), getRamp(), currentBook(),
  ]);
  const today = profile ? localDateOf(new Date(), profile.timezone, profile.dayRolloverHour) : "";
  const grad = profile ? graduationProgress(events, sessions, profile, today) : { days: 0 };
  const has = (t: ReadingEvent["type"]) => events.some((e) => e.type === t);

  return {
    signedUp: Boolean(profile),
    articleDone: has("article_completed"),
    dayOne: has("chunk_completed"),
    graduated: has("graduated"),
    qualifyingDaysLast14: grad.days,
    chunkParagraphs: ramp.chunkParagraphs,
    growRun: ramp.growRun,
    shrinkRun: ramp.shrinkRun,
    bookClubCode,
    chapters: cur?.book.chapters.length ?? 0,
    rampHistory: events
      .filter((e) => e.type === "portion_changed")
      .map((e) => ({
        at: e.localDate,
        from: Number(e.payload.from),
        to: Number(e.payload.to),
        reason: String(e.payload.reason),
      })),
    events: events.length,
  };
}
