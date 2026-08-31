/* ============================================================================
   STORAGE (V2) — IndexedDB. Everything the app knows, on this device only.
   ----------------------------------------------------------------------------
   The database is named "chapter-chat-v2", NOT V1's "reading-app". Both
   versions run on localhost, which is one origin, so sharing a name would mean
   V2 reading V1's word-based ramp state. They are deliberately separate:
   run V2 and your V1 data is still there, untouched.

   Invariants carried over from V1 unchanged:
     1. `events` is APPEND-ONLY.
     2. Every event write goes through recordEvent(). One choke point.
     3. localDate is FROZEN at write time via core.localDateOf().
     4. No derived statistic is stored. Exception, not a loophole: the ramp
        state (chunkParagraphs, growRun, shrinkRun) and the reading cursor are
        INPUTS to serving the next chunk, not aggregates over history.
     5. Session duration is SUMMED FROM HEARTBEATS.
     6. "Current book" is a QUERY, not a stored pointer.
   ========================================================================== */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  localDateOf,
  type AppSession, type EventType, type Profile, type ReadingEvent,
} from "./core.js";
import type { Chapter } from "./bookmodel.js";
import { INITIAL_RAMP, type RampState } from "./rampv2.js";
import { getPrefs, replacePrefs, type Prefs } from "./prefs.js";

export interface StoredBook {
  id: string;
  title: string;
  author?: string;
  format: "txt" | "epub";
  chapters: Chapter[];
  /** Cosmetic. Displayed in the library, never enforced, never reminded about. */
  deadline?: string;
  createdAt: string;
}

export type BookStatus = "reading" | "finished" | "abandoned";

export interface Progress {
  bookId: string;
  status: BookStatus;
  /** The chapter the reader is currently in. They may jump to any other. */
  chapterIndex: number;
  /** chapter index -> paragraphs read in that chapter. */
  read: Record<number, number>;
  startedAt: string;
  lastReadAt?: string;
  finishedAt?: string;
}

interface Schema extends DBSchema {
  profile: { key: string; value: Profile };
  ramp: { key: string; value: RampState };
  books: { key: string; value: StoredBook };
  progress: { key: string; value: Progress };
  events: { key: string; value: ReadingEvent; indexes: { localDate: string; bookId: string } };
  sessions: { key: string; value: AppSession; indexes: { localDate: string } };
}

const DB_NAME = "chapter-chat-v2";
const DB_VERSION = 1;
const ME = "me";

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbp) {
    dbp = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore("profile");
        d.createObjectStore("ramp");
        d.createObjectStore("books", { keyPath: "id" });
        d.createObjectStore("progress", { keyPath: "bookId" });
        const ev = d.createObjectStore("events", { keyPath: "id" });
        ev.createIndex("localDate", "localDate");
        ev.createIndex("bookId", "bookId");
        const se = d.createObjectStore("sessions", { keyPath: "id" });
        se.createIndex("localDate", "localDate");
      },
    });
  }
  return dbp;
}

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rand}`;
}

/* ------------------------------------------------------------- profile --- */

export async function getProfile(): Promise<Profile | undefined> {
  return (await db()).get("profile", ME);
}

export async function putProfile(p: Profile): Promise<void> {
  await (await db()).put("profile", p, ME);
}

export async function createProfile(): Promise<Profile> {
  const p: Profile = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    dayRolloverHour: 4,
    wpmSamples: [],
    track: "screen",
    createdAt: new Date().toISOString(),
  };
  await putProfile(p);
  return p;
}

async function requireProfile(): Promise<Profile> {
  return (await getProfile()) ?? (await createProfile());
}

/* ---------------------------------------------------------------- ramp --- */

/** The reader's chunk size. Global on purpose: it follows them across
    chapters and across books. */
export async function getRamp(): Promise<RampState> {
  return (await (await db()).get("ramp", ME)) ?? { ...INITIAL_RAMP };
}

export async function putRamp(r: RampState): Promise<void> {
  await (await db()).put("ramp", r, ME);
}

/* -------------------------------------------------------------- events --- */

export interface RecordEventInput {
  type: EventType;
  bookId?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
  at?: Date;
}

/** THE ONE PLACE an event is written. localDate is frozen here. */
export async function recordEvent(input: RecordEventInput): Promise<ReadingEvent> {
  const profile = await requireProfile();
  const at = input.at ?? new Date();
  const event: ReadingEvent = {
    id: uid(input.type),
    type: input.type,
    bookId: input.bookId,
    sessionId: input.sessionId,
    occurredAt: at.toISOString(),
    localDate: localDateOf(at, profile.timezone, profile.dayRolloverHour),
    payload: input.payload ?? {},
  };
  await (await db()).add("events", event);   // add(), not put() — append-only
  return event;
}

export async function allEvents(): Promise<ReadingEvent[]> {
  const rows = await (await db()).getAll("events");
  return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/* --------------------------------------------------------------- books --- */

export async function putBook(b: StoredBook): Promise<void> { await (await db()).put("books", b); }
export async function getBook(id: string): Promise<StoredBook | undefined> { return (await db()).get("books", id); }
export async function allBooks(): Promise<StoredBook[]> { return (await db()).getAll("books"); }

export async function putProgress(p: Progress): Promise<void> { await (await db()).put("progress", p); }
export async function allProgress(): Promise<Progress[]> { return (await db()).getAll("progress"); }

/** Invariant 6: a query, never a stored pointer. */
export async function currentProgress(): Promise<Progress | undefined> {
  const rows = (await allProgress()).filter((p) => p.status === "reading");
  if (rows.length === 0) return undefined;
  return rows.sort((a, b) =>
    (b.lastReadAt ?? b.startedAt).localeCompare(a.lastReadAt ?? a.startedAt))[0];
}

export async function currentBook(): Promise<{ book: StoredBook; progress: Progress } | null> {
  const progress = await currentProgress();
  if (!progress) return null;
  const book = await getBook(progress.bookId);
  return book ? { book, progress } : null;
}

/* ------------------------------------------------------------ sessions --- */

const BEAT_CAP_MS = 60_000;
const SILENCE_MS = 120_000;

export async function startSession(bookId?: string): Promise<AppSession> {
  const profile = await requireProfile();
  const now = new Date();
  const s: AppSession = {
    id: uid("sess"),
    bookId,
    startedAt: now.toISOString(),
    lastBeatAt: now.toISOString(),
    localDate: localDateOf(now, profile.timezone, profile.dayRolloverHour),
    activeSeconds: 0,
  };
  await (await db()).put("sessions", s);
  return s;
}

export async function heartbeat(sessionId: string): Promise<void> {
  const d = await db();
  const s = await d.get("sessions", sessionId);
  if (!s || s.endedAt) return;
  const now = Date.now();
  const gap = now - Date.parse(s.lastBeatAt);
  if (gap > SILENCE_MS) {
    s.endedAt = new Date(Date.parse(s.lastBeatAt)).toISOString();
    await d.put("sessions", s);
    return;
  }
  s.activeSeconds += Math.round(Math.min(gap, BEAT_CAP_MS) / 1000);
  s.lastBeatAt = new Date(now).toISOString();
  await d.put("sessions", s);
}

export async function endSession(sessionId: string): Promise<void> {
  const d = await db();
  const s = await d.get("sessions", sessionId);
  if (!s || s.endedAt) return;
  const gap = Date.now() - Date.parse(s.lastBeatAt);
  if (gap <= SILENCE_MS) s.activeSeconds += Math.round(Math.min(gap, BEAT_CAP_MS) / 1000);
  s.endedAt = new Date().toISOString();
  await d.put("sessions", s);
}

export async function allSessions(): Promise<AppSession[]> { return (await db()).getAll("sessions"); }

/* --------------------------------------------------- persistence & backup */

export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch { return null; }
}

export interface Backup {
  format: "chapter-chat.backup";
  version: 2;
  exportedAt: string;
  profile: Profile | null;
  ramp: RampState;
  books: StoredBook[];
  progress: Progress[];
  events: ReadingEvent[];
  sessions: AppSession[];
  prefs: Prefs;
}

export async function exportBackup(): Promise<Backup> {
  const [profile, ramp, books, progress, events, sessions] = await Promise.all([
    getProfile(), getRamp(), allBooks(), allProgress(), allEvents(), allSessions(),
  ]);
  return {
    format: "chapter-chat.backup", version: 2,
    exportedAt: new Date().toISOString(),
    profile: profile ?? null, ramp, books, progress, events, sessions,
    prefs: getPrefs(),
  };
}

export function backupBlob(b: Backup): Blob {
  return new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
}

export function backupFilename(): string {
  return `chapter-chat-v2-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** The ONE place stores are cleared, and only on an explicit restore. */
export async function importBackup(raw: string): Promise<void> {
  const parsed = JSON.parse(raw) as Backup;
  if (parsed?.format !== "chapter-chat.backup") {
    throw new Error("That file isn't a Chapter Chat backup.");
  }
  if (parsed.version !== 2) {
    throw new Error("That backup is from version 1 and can't be restored here.");
  }
  const d = await db();
  const names = ["profile", "ramp", "books", "progress", "events", "sessions"] as const;
  const tx = d.transaction(names, "readwrite");
  await Promise.all(names.map((n) => tx.objectStore(n).clear()));
  if (parsed.profile) await tx.objectStore("profile").put(parsed.profile, ME);
  await tx.objectStore("ramp").put(parsed.ramp ?? { ...INITIAL_RAMP }, ME);
  for (const b of parsed.books ?? []) await tx.objectStore("books").put(b);
  for (const p of parsed.progress ?? []) await tx.objectStore("progress").put(p);
  for (const e of parsed.events ?? []) await tx.objectStore("events").put(e);
  for (const s of parsed.sessions ?? []) await tx.objectStore("sessions").put(s);
  await tx.done;
  if (parsed.prefs) replacePrefs(parsed.prefs);
}

export async function deleteEverything(): Promise<void> {
  const d = await db();
  const names = ["profile", "ramp", "books", "progress", "events", "sessions"] as const;
  const tx = d.transaction(names, "readwrite");
  await Promise.all(names.map((n) => tx.objectStore(n).clear()));
  await tx.done;
  try { localStorage.removeItem("chapter-chat-v2.prefs"); } catch { /* ignore */ }
}
