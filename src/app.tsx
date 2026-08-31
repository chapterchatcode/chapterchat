/* ============================================================================
   APP SHELL (V2) — a state machine over the screens.
   ----------------------------------------------------------------------------
   Changes from V1:
     - a Book Club Code step immediately after sign-up
     - the book screen is a CHAPTER JOURNEY; reading can start at any chapter
     - chunks are paragraphs, served inside one chapter, never spilling over
     - a soft "Way to go!" line on return. No popup, no toast, no modal.
     - the paper migration (handoff / five-word check) is parked: those screens
       still exist in the codebase but nothing routes to them.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localDateOf, type Profile, type Rating } from "./core";
import {
  allBooks, allEvents, allProgress, backupBlob, backupFilename, createProfile,
  currentBook, deleteEverything, endSession, exportBackup, getProfile, getRamp,
  heartbeat, importBackup, putProfile, putProgress, putRamp, recordEvent,
  requestPersistence, startSession,
  type Progress, type StoredBook,
} from "./storage";
import {
  checkGraduation, completeSession, createBook, graduate, journey, planSession,
  selectChapter, serveChunkEvent,
  type BookMeta, type JourneyStep, type Session,
} from "./service";
import {
  parseBookFile, ReadableFileError, FILE_ERROR,
  type Chapter, type ParsedBook,
} from "./bookmodel";
import { INITIAL_RAMP, serveParagraphs, type RampState } from "./rampv2";
import { applyPrefs, getPrefs, setPrefs, type TextSize, type Theme } from "./prefs";
import { useHeartbeat } from "./hooks";

import { Welcome } from "./screens/Welcome";
import { CreateAccount, SignIn } from "./screens/Auth";
import { BookClubCode } from "./screens/BookClubCode";
import { ArticleIntro } from "./screens/ArticleIntro";
import { Reading } from "./screens/Reading";
import { Vote } from "./screens/Vote";
import { Setup, Processing } from "./screens/Setup";
import { BookScreen } from "./screens/BookScreen";
import { Library, type LibraryBook } from "./screens/Library";
import { Settings } from "./screens/Settings";
import { Graduation } from "./screens/Graduation";
import { Debug } from "./screens/Debug";

type Phase =
  | "boot" | "welcome" | "create" | "signin" | "bookclub"
  | "article-intro" | "article-read" | "article-vote"
  | "setup" | "processing"
  | "book" | "reading" | "session-vote"
  | "library" | "settings" | "graduation";

const HEARTBEAT_MS = 30_000;
const IDLE_DISCARD_MS = 5 * 60_000;

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [book, setBook] = useState<StoredBook | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [ramp, setRamp] = useState<RampState>(INITIAL_RAMP);

  const [session, setSession] = useState<Session | null>(null);
  const [softMessage, setSoftMessage] = useState<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const dwell = useRef<{ startedAt: number; hiddenAt: number | null; discarded: number }>({
    startedAt: 0, hiddenAt: null, discarded: 0,
  });

  const [article, setArticle] = useState<{ title: string; paragraphs: string[]; words: number } | null>(null);
  const articleTimer = useRef<{ startedAt: number; hiddenAt: number | null; discarded: number }>({
    startedAt: 0, hiddenAt: null, discarded: 0,
  });
  const [articleSeconds, setArticleSeconds] = useState(0);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const parsedRef = useRef<ParsedBook | null>(null);
  const [parseDone, setParseDone] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const pendingMeta = useRef<BookMeta | null>(null);

  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [installHint, setInstallHint] = useState(false);

  const isDebugRoute = useMemo(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return window.location.pathname.replace(/\/$/, "") === `${base}/debug`;
  }, []);

  /* ------------------------------------------------------------------ boot */

  useEffect(() => {
    void (async () => {
      applyPrefs();
      const persisted = await requestPersistence();
      setPrefs({ storagePersisted: persisted, visits: getPrefs().visits + 1 });

      const p = await getProfile();
      if (!p) { setPhase("welcome"); return; }
      setProfile(p);
      setRamp(await getRamp());

      const events = await allEvents();
      if (!events.some((e) => e.type === "article_completed")) { setPhase("article-intro"); return; }

      const grad = await checkGraduation(p);
      if (grad.eligible && !grad.alreadyGraduated) {
        setProfile(await graduate(p, grad.days));
        setPhase("graduation");
        return;
      }

      const cur = await currentBook();
      if (!cur) {
        setPhase(events.some((e) => e.type === "book_started") ? "library" : "setup");
        return;
      }
      setBook(cur.book);
      setProgress(cur.progress);
      if (isIOS() && !isStandalone() && !getPrefs().installPromptSeen) setInstallHint(true);
      setPhase("book");
    })();
  }, []);

  /* --------------------------------------------------------------- article */

  const loadArticle = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}onboarding-article.txt`);
    const raw = (await res.text()).replace(/\r\n/g, "\n").trim();
    const paras = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    const title = paras[0].replace(/\s+by\s+.*$/i, "").trim();
    const body = paras.slice(1);
    setArticle({ title, paragraphs: body, words: body.join(" ").split(/\s+/).filter(Boolean).length });
    articleTimer.current = { startedAt: Date.now(), hiddenAt: null, discarded: 0 };
    setPhase("article-read");
  }, []);

  useEffect(() => {
    const onVis = () => {
      const t = phase === "article-read" ? articleTimer.current : dwell.current;
      if (document.visibilityState === "hidden") t.hiddenAt = Date.now();
      else if (t.hiddenAt) {
        const gap = Date.now() - t.hiddenAt;
        if (gap > IDLE_DISCARD_MS) t.discarded += gap;
        t.hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  const submitArticleVote = async (rating: Rating) => {
    const words = article?.words ?? 0;
    const wpm = Math.max(60, Math.min(900, Math.round((words / Math.max(1, articleSeconds)) * 60)));
    const base = profile ?? (await createProfile());
    const next: Profile = {
      ...base, calibrationRating: rating, calibrationWpm: wpm,
      wpmSamples: [...base.wpmSamples, wpm],
    };
    await putProfile(next);
    setProfile(next);
    await recordEvent({ type: "article_completed", payload: { rating, wpm, seconds: articleSeconds, words } });
    // The comfort vote calibrates WPM only. The reading chunk always starts at
    // one paragraph — that is the whole point of V2's ramp.
    await putRamp({ ...INITIAL_RAMP });
    setRamp({ ...INITIAL_RAMP });
    setPhase("setup");
  };

  /* ---------------------------------------------------------------- ingest */

  const runParse = useCallback(async (file: File) => {
    setFileError(null);
    setFileName(file.name);
    setChapters([]);
    setParseDone(false);
    parsedRef.current = null;
    try {
      const parsed = await parseBookFile(file);
      parsedRef.current = parsed;
      setChapters(parsed.chapters);
      setParseDone(true);
    } catch (e) {
      setFileError(e instanceof ReadableFileError ? e.message : FILE_ERROR);
      setFileName(null);
    }
  }, []);

  useEffect(() => {
    if (phase !== "processing") return;
    if (parseDone) {
      setProcessProgress(1);
      const t = window.setTimeout(() => void finishSetup(), 400);
      return () => window.clearTimeout(t);
    }
    const id = window.setInterval(() => setProcessProgress((p) => Math.min(0.9, p + 0.07)), 110);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, parseDone]);

  const finishSetup = async () => {
    const parsed = parsedRef.current;
    const meta = pendingMeta.current;
    if (!parsed || !meta) return;
    const { book: b, progress: pr } = await createBook(parsed, meta);
    setBook(b);
    setProgress(pr);
    await beginReading(b, pr, b.chapters[0].index);
  };

  /* --------------------------------------------------------------- reading */

  const beginReading = async (b: StoredBook, pr: Progress, chapterIndex: number) => {
    const r = await getRamp();
    setRamp(r);
    const withChapter = pr.chapterIndex === chapterIndex ? pr : await selectChapter(pr, chapterIndex);
    setProgress(withChapter);

    const s = planSession(b, withChapter, r);
    if (s.serving.paragraphs.length === 0) {
      // Chapter already finished — nothing to serve. Stay on the book screen.
      setSoftMessage("You've finished that chapter. Pick another to keep going.");
      setPhase("book");
      return;
    }
    await serveChunkEvent(b, s);
    setSession(s);
    setSoftMessage(null);

    const appSession = await startSession(b.id);
    sessionId.current = appSession.id;
    dwell.current = { startedAt: Date.now(), hiddenAt: null, discarded: 0 };
    setPhase("reading");
  };

  useHeartbeat(phase === "reading", HEARTBEAT_MS, () => {
    if (sessionId.current) void heartbeat(sessionId.current);
  });

  /** Never cut off someone in flow — but never past the end of the chapter. */
  const keepReading = () => {
    if (!book || !session) return;
    const extended = serveParagraphs(
      session.chapter.paragraphs,
      session.serving.from,
      session.serving.to - session.serving.from + 1,
      session.chapter.index,
    );
    if (extended.to <= session.serving.to) return;
    void recordEvent({
      type: "keep_reading",
      bookId: book.id,
      payload: { chapter: session.chapter.index, extraParagraphs: 1 },
    });
    setSession({ ...session, serving: extended });
  };

  const dwellSeconds = () => {
    const t = dwell.current;
    return Math.max(1, Math.round((Date.now() - t.startedAt - t.discarded) / 1000));
  };

  const submitSessionVote = async (rating: Rating) => {
    if (!book || !progress || !session) return;
    if (sessionId.current) { await endSession(sessionId.current); sessionId.current = null; }

    const result = await completeSession(book, progress, session, rating, dwellSeconds());
    setProgress(result.progress);
    setRamp(result.ramp);
    setSession(null);
    setSoftMessage(result.message);

    const p = await getProfile();
    if (p) {
      setProfile(p);
      const grad = await checkGraduation(p);
      if (grad.eligible && !grad.alreadyGraduated) {
        setProfile(await graduate(p, grad.days));
        setPhase("graduation");
        return;
      }
    }

    if (result.progress.status === "finished") {
      await openLibrary();
      return;
    }
    setPhase("book");
  };

  const leaveReading = async () => {
    if (sessionId.current) { await endSession(sessionId.current); sessionId.current = null; }
    setSession(null);
    setSoftMessage(null);
    setPhase("book");
  };

  /* ----------------------------------------------------------------- shell */

  const openLibrary = async () => {
    const [books, prog] = await Promise.all([allBooks(), allProgress()]);
    const byId = new Map(prog.map((p) => [p.bookId, p]));
    setLibraryBooks(
      books.map((b) => {
        const pr = byId.get(b.id);
        return {
          id: b.id,
          title: b.title,
          deadline: b.deadline,
          chapters: b.chapters.map((c) => ({
            index: c.index,
            title: c.title,
            state: (() => {
              const read = pr?.read[c.index] ?? 0;
              if (read >= c.paragraphs.length) return "read" as const;
              return read > 0 ? ("reading" as const) : ("unread" as const);
            })(),
          })),
        };
      }),
    );
    setPhase("library");
  };

  const openBook = async (bookId: string) => {
    const [books, prog] = await Promise.all([allBooks(), allProgress()]);
    const b = books.find((x) => x.id === bookId);
    const pr = prog.find((x) => x.bookId === bookId);
    if (!b || !pr) return;
    if (pr.status !== "reading") await putProgress({ ...pr, status: "reading" });
    setBook(b);
    setProgress({ ...pr, status: "reading" });
    setSoftMessage(null);
    setPhase("book");
  };

  const doExport = async () => {
    download(backupBlob(await exportBackup()), backupFilename());
    setNotice("Backup saved.");
  };

  const doImport = async (f: File) => {
    try {
      await importBackup(await f.text());
      applyPrefs();
      setProfile((await getProfile()) ?? null);
      setRamp(await getRamp());
      const cur = await currentBook();
      setBook(cur?.book ?? null);
      setProgress(cur?.progress ?? null);
      setNotice("Restored. Your books and history are back.");
      setPhase(cur ? "book" : "library");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That file didn't open. Choose a Chapter Chat backup file.");
    }
  };

  const steps: JourneyStep[] = book && progress ? journey(book, progress) : [];

  /* ---------------------------------------------------------------- render */

  if (isDebugRoute) return <Debug />;

  switch (phase) {
    case "boot":
      return <div className="screen" />;

    case "welcome":
      return <Welcome onStart={() => setPhase("create")} onSignIn={() => setPhase("signin")} />;

    case "create":
      return (
        <CreateAccount
          onBack={() => setPhase("welcome")}
          onSignIn={() => setPhase("signin")}
          onSubmit={async (name, email) => {
            setPrefs({ account: { name, email } });
            const p = (await getProfile()) ?? (await createProfile());
            setProfile(p);
            setPhase("bookclub");
          }}
        />
      );

    case "signin":
      return (
        <SignIn
          onBack={() => setPhase("welcome")}
          onCreate={() => setPhase("create")}
          onSubmit={async (email) => {
            const existing = getPrefs().account;
            setPrefs({ account: { name: existing?.name ?? "", email } });
            const p = (await getProfile()) ?? (await createProfile());
            setProfile(p);
            const done = (await allEvents()).some((e) => e.type === "article_completed");
            setPhase(done ? "book" : "bookclub");
          }}
        />
      );

    case "bookclub":
      return (
        <BookClubCode
          onBack={() => setPhase("create")}
          onSubmit={(code) => { setPrefs({ bookClubCode: code }); setPhase("article-intro"); }}
          onSkip={() => { setPrefs({ bookClubCode: null }); setPhase("article-intro"); }}
        />
      );

    case "article-intro":
      return <ArticleIntro onBegin={() => void loadArticle()} onBack={() => setPhase("bookclub")} />;

    case "article-read":
      return article ? (
        <Reading
          title={article.title}
          paragraphs={article.paragraphs}
          onDone={() => {
            const t = articleTimer.current;
            setArticleSeconds(Math.max(1, Math.round((Date.now() - t.startedAt - t.discarded) / 1000)));
            setPhase("article-vote");
          }}
        />
      ) : (
        <div className="screen" />
      );

    case "article-vote":
      return (
        <Vote progress={0.55} onSubmit={(r) => void submitArticleVote(r)}
              onBack={() => setPhase("article-read")} />
      );

    case "setup":
      return (
        <Setup
          today={profile
            ? localDateOf(new Date(), profile.timezone, profile.dayRolloverHour)
            : new Date().toISOString().slice(0, 10)}
          chapters={chapters}
          fileName={fileName}
          fileError={fileError}
          onFile={(f) => void runParse(f)}
          onBack={() => setPhase(book ? "book" : "article-intro")}
          onComplete={(meta) => {
            pendingMeta.current = meta;
            setProcessProgress(0);
            setPhase("processing");
          }}
        />
      );

    case "processing":
      return <Processing progress={processProgress} />;

    case "book":
      return book && progress ? (
        <BookScreen
          bookTitle={book.title}
          steps={steps}
          message={softMessage ?? (installHint
            ? "Add Chapter Chat to your home screen — tap Share, then Add to Home Screen."
            : null)}
          onStartChapter={(index) => {
            if (installHint) { setPrefs({ installPromptSeen: true }); setInstallHint(false); }
            void beginReading(book, progress, index);
          }}
          onLibrary={() => void openLibrary()}
          onSettings={() => setPhase("settings")}
        />
      ) : (
        <div className="screen" />
      );

    case "reading":
      return book && session ? (
        <Reading
          title={`${book.title} · ${session.chapter.title}`}
          onTitle={() => void leaveReading()}
          leadIn={session.leadIn}
          paragraphs={session.serving.paragraphs}
          onDone={() => setPhase("session-vote")}
          onKeepReading={session.serving.finishesChapter ? undefined : keepReading}
        />
      ) : (
        <div className="screen" />
      );

    case "session-vote":
      return <Vote onSubmit={(r) => void submitSessionVote(r)} />;

    case "library":
      return (
        <Library
          books={libraryBooks}
          onOpenBook={(id) => void openBook(id)}
          onAddBook={() => { setFileName(null); setFileError(null); setChapters([]); setPhase("setup"); }}
          onBack={() => setPhase(book ? "book" : "library")}
        />
      );

    case "settings":
      return (
        <Settings
          theme={getPrefs().theme}
          textSize={getPrefs().textSize}
          bookClubCode={getPrefs().bookClubCode}
          chunkParagraphs={ramp.chunkParagraphs}
          notice={notice}
          onTheme={(t: Theme) => { setPrefs({ theme: t }); applyPrefs(); setNotice(null); setPhase("settings"); }}
          onTextSize={(s: TextSize) => { setPrefs({ textSize: s }); applyPrefs(); setNotice(null); setPhase("settings"); }}
          onBookClubCode={(c) => { setPrefs({ bookClubCode: c || null }); setPhase("settings"); }}
          onExport={() => void doExport()}
          onImport={(f) => void doImport(f)}
          onSignOut={() => { setPrefs({ account: null }); setPhase("welcome"); }}
          onDelete={async () => {
            await deleteEverything();
            setProfile(null); setBook(null); setProgress(null); setRamp(INITIAL_RAMP);
            setPhase("welcome");
          }}
          onBack={() => { setNotice(null); setPhase(book ? "book" : "library"); }}
        />
      );

    case "graduation":
      return (
        <Graduation
          onDone={async () => {
            const cur = await currentBook();
            setBook(cur?.book ?? null);
            setProgress(cur?.progress ?? null);
            setPhase(cur ? "book" : "library");
          }}
        />
      );
  }
}
