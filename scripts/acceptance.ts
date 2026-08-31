/* Machine-checkable slices of PROMPT_BUILD Part 7. The browser-only checks
   (A2/A3/A4, install, wake lock) are listed in DECISIONS.md as device tests. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  localDateOf, graduationProgress, addDays,
  type AppSession, type Profile, type ReadingEvent,
} from "../src/core.js";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const srcFiles = walk("src");
const authored = srcFiles.filter(
  (f) => !f.endsWith("core.ts") && !f.endsWith("core.test.ts") && !f.endsWith("seed.ts") &&
         !f.endsWith("tokens.css") && !f.endsWith("tokens.theme.css"),
);
const read = (f: string) => readFileSync(f, "utf8");

/** Comments name the prohibitions in order to explain them. Scan code only. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/* -- A6: 01:30 local with a 4am rollover belongs to the PREVIOUS day ------- */
console.log("\n=== A6 · day rollover ===");
{
  const at = new Date("2026-03-15T20:00:00Z");           // 01:30 IST on the 16th
  const d = localDateOf(at, "Asia/Kolkata", 4);
  ok("01:30 IST carries the previous day", d === "2026-03-15", `got ${d}`);
  const evening = localDateOf(new Date("2026-03-15T16:00:00Z"), "Asia/Kolkata", 4);
  ok("21:30 IST carries the same day", evening === "2026-03-15", `got ${evening}`);
}

/* -- A7: seven NON-CONSECUTIVE days inside 14 graduate; six do not --------- */
console.log("\n=== A7 · graduation window ===");
{
  const profile: Profile = {
    timezone: "Asia/Kolkata", dayRolloverHour: 4, wpmSamples: [],
    calibrationWpm: 200, track: "paper", createdAt: "2026-01-01T00:00:00Z",
  };
  const today = "2026-03-20";
  const target = 200 * 30;
  const ev = (localDate: string): ReadingEvent => ({
    id: `e${localDate}`, type: "offline_verified", occurredAt: `${localDate}T18:00:00Z`,
    localDate, payload: { wordsRead: target + 10 },
  });

  const gaps = [0, 2, 3, 5, 8, 10, 13];                  // scattered, never a streak
  const seven = gaps.map((g) => ev(addDays(today, -g)));
  const six = seven.slice(1);
  const sessions: AppSession[] = [];

  const r7 = graduationProgress(seven, sessions, profile, today);
  const r6 = graduationProgress(six, sessions, profile, today);
  ok("7 non-consecutive days graduate", r7.eligible && r7.days === 7, JSON.stringify(r7));
  ok("6 days do not", !r6.eligible && r6.days === 6, JSON.stringify(r6));

  const outside = [...seven.slice(1), ev(addDays(today, -20))];
  const rOut = graduationProgress(outside, sessions, profile, today);
  ok("a day outside the 14-window does not count", !rOut.eligible, JSON.stringify(rOut));

  const short: ReadingEvent[] = gaps.map((g) => ({
    ...ev(addDays(today, -g)), payload: { wordsRead: 100 },
  }));
  ok("offline reads under the 30-minute target never qualify",
     graduationProgress(short, sessions, profile, today).days === 0);
}

/* -- A8: nothing on the reading screen may imply progress ----------------- */
console.log("\n=== A8 · reading screen prohibitions ===");
{
  const reading = code("src/screens/Reading.tsx") + code("src/screens/Handoff.tsx");
  ok("no percentage", !/%\s*(complete|read|done)|percent/i.test(reading));
  ok("no 'pages left' / 'minutes left'", !/(pages|minutes|words)\s+(left|remaining)/i.test(reading));
  ok("no progress element on the reader", !/role="progressbar"|<progress/i.test(reading));
  const css = read("src/styles/app.css");
  ok("scrollbar hidden on the reader",
     /scrollbar-width:\s*none/.test(css) && /::-webkit-scrollbar\s*\{\s*display:\s*none/.test(css));
  // DESIGN 2.17 mandates the sentence "That's not a streak. That's a reader."
  // Denying a streak in copy is the opposite of displaying one.
  const noStreakCopy = authored.map(code).join("\n").replace(/That's not a streak\./g, "");
  ok("no streak, flame or calendar grid anywhere",
     !/\bstreak\b|flame|calendar/i.test(noStreakCopy));
}

/* -- A11: colour values live in tokens.css only --------------------------- */
console.log("\n=== A11 · no hand-authored hex outside tokens.css ===");
{
  const offenders: string[] = [];
  for (const f of authored) {
    if (!/\.(css|tsx|ts|html)$/.test(f)) continue;
    const hits = read(f).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    if (hits.length) offenders.push(`${f}: ${hits.join(", ")}`);
  }
  const html = readFileSync("index.html", "utf8").match(/#[0-9a-fA-F]{6}/g) ?? [];
  ok("no hex in authored src files", offenders.length === 0, `\n        ${offenders.join("\n        ")}`);
  ok("index.html theme-color is the only markup hex, and matches --paper/--paper dark",
     html.every((h) => ["#F6F1E7", "#171613"].includes(h)), html.join(","));
}

/* -- A15: the staircase exists in exactly one component ------------------- */
console.log("\n=== A15 · staircase appears once ===");
{
  const withPath = authored.filter((f) => /\.tsx$/.test(f) && /M2,70 L26,70/.test(read(f)));
  ok("one component draws the staircase", withPath.length === 1, withPath.join(","));
  ok("it is Staircase.tsx", withPath[0]?.endsWith("Staircase.tsx") === true);
  const users = authored.filter((f) => /<Staircase\s*\/>/.test(read(f)));
  ok("it is rendered on exactly one screen", users.length === 1, users.join(","));
  ok("that screen is Graduation", users[0]?.endsWith("Graduation.tsx") === true);
}

/* -- A18: no chromatic accent -------------------------------------------- */
console.log("\n=== A18 · no accent colour ===");
{
  const all = authored.filter((f) => /\.(css|tsx|ts)$/.test(f)).map(code).join("\n");
  ok("no terracotta / clay hex", !/#D97757|#d97757/.test(all));
  ok("no named colour keywords", !/\b(color|background|fill|stroke)\s*:\s*(green|teal|peach|orange|blue|red|purple)\b/i.test(all));
  const gradients = (all.match(/linear-gradient\([^)]*\)/g) ?? []);
  ok("the only gradient is the reader's bottom fade",
     gradients.length === 1 && /transparent,\s*var\(--page\)/.test(gradients[0]),
     gradients.join(" | "));
}

/* -- A19: no network origin beyond Google Fonts --------------------------- */
console.log("\n=== A19 · network surface ===");
{
  const all = [...authored.filter((f) => /\.(ts|tsx|css|html)$/.test(f)), "index.html"].map(code).join("\n");
  const urls = [...all.matchAll(/https?:\/\/([^\/"'\s)]+)/g)].map((m) => m[1]);
  const allowed = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
  const bad = [...new Set(urls)].filter((h) => !allowed.has(h));
  ok("no third-party origin beyond Google Fonts", bad.length === 0, bad.join(","));
  ok("no analytics or tracker import",
     !/\bgtag\b|\banalytics\b|@sentry|\bmixpanel\b|\bamplitude\b|segment\.com/i.test(all));
}

/* -- core.ts untouched ---------------------------------------------------- */
console.log("\n=== core.ts is unmodified ===");
{
  const ours = readFileSync("src/core.ts", "utf8");
  const given = readFileSync(
    "/home/claude/proj/app/reading-stamina-app/code/core.ts", "utf8");
  ok("core.ts is byte-identical to the file provided", ours === given);
  const givenTest = readFileSync(
    "/home/claude/proj/app/reading-stamina-app/code/core.test.ts", "utf8");
  ok("core.test.ts is byte-identical", readFileSync("src/core.test.ts", "utf8") === givenTest);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
