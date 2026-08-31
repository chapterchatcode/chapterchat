/* ============================================================================
   DEVICE PREFERENCES — localStorage, not IndexedDB.
   ----------------------------------------------------------------------------
   These are display settings and one-shot UI flags, not domain data. They are
   deliberately kept out of the five object stores so that §3.1 stays exactly as
   specified, and out of `Profile` so that core.ts is never modified. They are
   still carried in the JSON export so a restore feels complete.

   The local account record lives here for the same reason: there is no server
   to authenticate against, so name/email are a display record, not an identity.
   ========================================================================== */

export type Theme = "system" | "light" | "dark";
export const TEXT_SIZES = [17, 19, 21, 23] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface Prefs {
  theme: Theme;
  /** V2: entered right after sign-up. Stored, never validated — there is no
      server to validate it against. Skipping leaves it null. */
  bookClubCode: string | null;
  textSize: TextSize;
  account: { name: string; email: string } | null;
  visits: number;
  installPromptSeen: boolean;
  trackNudgeShown: boolean;
  backupOfferedOn: string | null;   // localDate of the last backup offer
  storagePersisted: boolean | null;
}

const KEY = "chapter-chat-v2.prefs";

const DEFAULTS: Prefs = {
  theme: "system",
  bookClubCode: null,
  textSize: 19,
  account: null,
  visits: 0,
  installPromptSeen: false,
  trackNudgeShown: false,
  backupOfferedOn: null,
  storagePersisted: null,
};

let cache: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode or quota. Preferences are not worth failing a session over. */
  }
  return next;
}

export function replacePrefs(p: Partial<Prefs>): void {
  cache = { ...DEFAULTS, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

/** Applies theme and reading size to the document root. */
export function applyPrefs(): void {
  const p = getPrefs();
  const root = document.documentElement;
  if (p.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", p.theme);
  root.style.setProperty("--read-size", `${p.textSize}px`);
}
