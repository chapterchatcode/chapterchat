import * as C from "./core.js";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const eq = (name: string, a: any, b: any) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `\n        got ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`);

const profile = (o: Partial<C.Profile> = {}): C.Profile => ({
  timezone: "Asia/Kolkata", dayRolloverHour: 4, wpmSamples: [],
  calibrationWpm: 200, track: "paper", createdAt: "2026-01-01T00:00:00Z", ...o,
});
const ub = (o: Partial<C.UserBook> = {}): C.UserBook => ({
  bookId: "b1", status: "reading", cursorBlock: 0, cursorWord: 0,
  baselineWords: 550, portionWords: 550, sessionsSincePortionChange: 5,
  offlineStage: 0, stageSuccessCount: 0, chapterDeadlines: {},
  startedAt: "2026-01-01T00:00:00Z", ...o,
});

console.log("\n=== DAY ROLLOVER (4am) ===");
eq("01:30 IST files under the PREVIOUS day",
   C.localDateOf(new Date("2026-07-20T01:30:00+05:30"), "Asia/Kolkata", 4), "2026-07-19");
eq("09:00 IST files under that day",
   C.localDateOf(new Date("2026-07-20T09:00:00+05:30"), "Asia/Kolkata", 4), "2026-07-20");
eq("03:59 IST still previous day",
   C.localDateOf(new Date("2026-07-20T03:59:00+05:30"), "Asia/Kolkata", 4), "2026-07-19");
eq("04:01 IST is the new day",
   C.localDateOf(new Date("2026-07-20T04:01:00+05:30"), "Asia/Kolkata", 4), "2026-07-20");
eq("UTC user unaffected by IST",
   C.localDateOf(new Date("2026-07-20T09:00:00Z"), "UTC", 4), "2026-07-20");

console.log("\n=== WPM ===");
eq("falls back to calibration under 5 samples",
   C.effectiveWpm(profile({ wpmSamples: [180, 220] })), 200);
eq("rolling median at 5+ samples",
   C.effectiveWpm(profile({ wpmSamples: [150, 300, 210, 190, 220] })), 210);
eq("30-minute word target tracks live wpm",
   C.thirtyMinuteWords(profile({ wpmSamples: [200, 200, 200, 200, 200] })), 6000);

console.log("\n=== RAMP A ===");
eq("two consecutive Comfortable -> +12%",
   C.applyRampA({ ub: ub(), rating: 4, abandoned: false, history: [4], now: new Date() }).portionWords, 616);
eq("single Comfortable holds",
   C.applyRampA({ ub: ub(), rating: 4, abandoned: false, history: [3], now: new Date() }).change, "hold");
eq("Just right holds (plateau is the point)",
   C.applyRampA({ ub: ub(), rating: 3, abandoned: false, history: [3], now: new Date() }).change, "hold");
eq("Little effort holds (productive stretch)",
   C.applyRampA({ ub: ub(), rating: 2, abandoned: false, history: [2], now: new Date() }).change, "hold");
eq("two consecutive Extra effort -> -15%",
   C.applyRampA({ ub: ub(), rating: 1, abandoned: false, history: [1], now: new Date() }).portionWords, 468);
eq("abandoned overrides a dishonest 5",
   C.applyRampA({ ub: ub(), rating: 5, abandoned: true, history: [1], now: new Date() }).change, "down");
eq("cooldown: no change within 2 sessions",
   C.applyRampA({ ub: ub({ sessionsSincePortionChange: 1 }), rating: 5, abandoned: false,
                  history: [5], now: new Date() }).change, "hold");
{
  const now = new Date("2026-07-20T00:00:00Z");
  eq("interlock: stage moved 3 days ago blocks a size change",
     C.applyRampA({ ub: ub({ stageChangedAt: "2026-07-17T00:00:00Z" }), rating: 5,
                    abandoned: false, history: [5], now }).change, "hold");
  eq("interlock clears after 7 days",
     C.applyRampA({ ub: ub({ stageChangedAt: "2026-07-10T00:00:00Z" }), rating: 5,
                    abandoned: false, history: [5], now }).change, "up");
}

console.log("\n=== RAMP B ===");
{
  const now = new Date("2026-07-20T00:00:00Z");
  eq("screen track never advances",
     C.applyRampB({ ub: ub({ offlineStage: 1 }), track: "screen", rating: 5, verified: true, now }).advanced, false);
  eq("unverified log does not count",
     C.applyRampB({ ub: ub({ offlineStage: 1 }), track: "paper", rating: 5, verified: false, now }).successCount, 0);
  eq("uncomfortable log does not count",
     C.applyRampB({ ub: ub({ offlineStage: 1 }), track: "paper", rating: 2, verified: true, now }).successCount, 0);
  eq("stage 1 advances on 3rd success",
     C.applyRampB({ ub: ub({ offlineStage: 1, stageSuccessCount: 2 }), track: "paper",
                    rating: 3, verified: true, now }).offlineStage, 2);
  eq("stage 3 needs 4, not 3",
     C.applyRampB({ ub: ub({ offlineStage: 3, stageSuccessCount: 2 }), track: "paper",
                    rating: 4, verified: true, now }).advanced, false);
  eq("interlock: portion moved 2 days ago blocks a stage advance",
     C.applyRampB({ ub: ub({ offlineStage: 1, stageSuccessCount: 2, portionChangedAt: "2026-07-18T00:00:00Z" }),
                    track: "paper", rating: 5, verified: true, now }).advanced, false);
  eq("stage 7 is terminal",
     C.applyRampB({ ub: ub({ offlineStage: 7, stageSuccessCount: 9 }), track: "paper",
                    rating: 5, verified: true, now }).offlineStage, 7);
}

console.log("\n=== GRADUATION (7 in any rolling 14) ===");
{
  const p = profile({ wpmSamples: [200, 200, 200, 200, 200] });   // target 6000w
  const ev = (d: string, words: number): C.ReadingEvent =>
    ({ id: d, type: "offline_verified", occurredAt: d, localDate: d, payload: { wordsRead: words } });
  const gapped = ["2026-07-07", "2026-07-09", "2026-07-10", "2026-07-13",
                  "2026-07-15", "2026-07-18", "2026-07-19"].map(d => ev(d, 6600));
  const r1 = C.graduationProgress(gapped, [], p, "2026-07-20");
  eq("7 NON-CONSECUTIVE days graduate (missed nights never reset)", [r1.days, r1.eligible], [7, true]);

  const r2 = C.graduationProgress(gapped.slice(0, 6), [], p, "2026-07-20");
  eq("6 days does not graduate", [r2.days, r2.eligible], [6, false]);

  const withShort = [...gapped.slice(0, 6), ev("2026-07-19", 900)];
  eq("a below-target offline read does not count",
     C.graduationProgress(withShort, [], p, "2026-07-20").eligible, false);

  const old = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04",
               "2026-06-05", "2026-06-06", "2026-06-07"].map(d => ev(d, 6600));
  eq("days outside the 14-day window are excluded",
     C.graduationProgress(old, [], p, "2026-07-20").days, 0);

  const sess = (d: string, secs: number): C.AppSession =>
    ({ id: d, startedAt: d, lastBeatAt: d, localDate: d, activeSeconds: secs });
  const screenDays = ["2026-07-08", "2026-07-09", "2026-07-11", "2026-07-13",
                      "2026-07-15", "2026-07-17", "2026-07-20"].map(d => sess(d, 1900));
  eq("screen track: 7 sessions of 30+ min graduate",
     C.graduationProgress([], screenDays, p, "2026-07-20").eligible, true);
  eq("a 12-minute session does not count",
     C.graduationProgress([], [...screenDays.slice(0, 6), sess("2026-07-20", 720)], p, "2026-07-20").eligible, false);
}

console.log("\n=== BOOK TWO ===");
eq("graduate resumes at 80% of graduated size, stage 6",
   C.nextBookStart(ub({ portionWords: 6200, baselineWords: 550 }), true, true, 550),
   { baselineWords: 4960, offlineStage: 6, track: "paper" });
eq("graduate without a copy drops to screen track at stage 0",
   C.nextBookStart(ub({ portionWords: 6200 }), true, false, 550),
   { baselineWords: 4960, offlineStage: 0, track: "screen" });
eq("abandoner restarts at previous baseline +25%",
   C.nextBookStart(ub({ portionWords: 900, baselineWords: 550 }), false, true, 550),
   { baselineWords: 688, offlineStage: 0, track: "paper" });

console.log("\n=== CHUNKING ===");
{
  // Four chapters of ~1200 words against a 400-word target: three chunks per
  // chapter, so chapter ends are genuinely reachable. A chapter shorter than
  // ~2 chunks cannot align without a bad length, and the solver is right to
  // skip it — validateBoundaries only checks alignment at 3+ chapters.
  const chapter = (n: string, extra: string[] = []) => [
    `Chapter ${n}`,
    "The morning came in grey and slow across the water. " + "word ".repeat(190),
    "She had not expected the quiet. " + "word ".repeat(190),
    ...extra,
    "However, the day would not stay quiet for long. " + "word ".repeat(190),
    "Later, in the town, the market was already loud. " + "word ".repeat(190),
    "The letter arrived on a Tuesday and said very little. " + "word ".repeat(190),
    "They read it twice before speaking. " + "word ".repeat(190),
  ].join("\n\n");
  const book = [chapter("One", ["* * *"]), chapter("Two"), chapter("Three"), chapter("Four")].join("\n\n");

  const paras = C.parseText(book);
  const blocks = C.buildBlocks(paras);
  const cost = C.scoreGaps(blocks);
  ok("chapter headings detected", paras.filter(p => p.tags.includes("chapter_start")).length === 4);
  ok("scene divider detected", paras.some(p => p.tags.includes("scene_divider")));

  const chapIdx = blocks.map((b, i) => b.tags.includes("chapter_start") ? i : -1).filter(i => i > 0);
  ok("chapter gap costs 0", chapIdx.every(i => cost[i] === 0), `costs=${chapIdx.map(i => cost[i])}`);
  const connIdx = blocks.findIndex(b => /^However/.test(b.text));
  ok("gap before a connective is penalised", cost[connIdx] >= 20, `cost=${cost[connIdx]}`);

  const bounds = C.solveBoundaries(blocks, cost, 400);
  ok("boundaries are strictly increasing from 0",
     bounds[0] === 0 && bounds.every((b, i) => i === 0 || b > bounds[i - 1]), JSON.stringify(bounds));
  ok("final boundary is the end of the book", bounds[bounds.length - 1] === blocks.length);
  const v = C.validateBoundaries(blocks, bounds, 400);
  ok("chapter alignment at or above the 60% floor", v.chapterAlignment >= 0.6,
     `alignment=${v.chapterAlignment}`);

  const chapters = C.detectChapters(blocks);
  eq("four chapters detected", chapters.length, 4);
  eq("cursor before chapter 2 -> ch1 read, ch2 unread",
     [C.chapterStatus(chapters[0], chapters[0].endWord), C.chapterStatus(chapters[1], chapters[0].endWord)],
     ["read", "unread"]);
  eq("cursor inside chapter 2 -> reading",
     C.chapterStatus(chapters[1], chapters[1].startWord + 10), "reading");
}

console.log("\n=== STAGE SPLIT ===");
{
  const blocks = Array.from({ length: 10 }, (_, i) =>
    ({ i, text: "x", words: 100, startWord: i * 100, tags: [] as string[] }));
  eq("stage 0 keeps everything in-app", C.splitForStage(blocks, 0, 8, 0).inAppTo, 8);
  eq("stage 1 holds back the last block", C.splitForStage(blocks, 0, 8, 1).inAppTo, 7);
  eq("stage 4 splits about half", C.splitForStage(blocks, 0, 8, 4).inAppTo, 4);
  eq("stage 6 is fully offline", C.splitForStage(blocks, 0, 8, 6).inAppTo, 0);
}

console.log("\n=== FIVE-WORD VERIFICATION ===");
{
  const text = ("alpha beta gamma delta epsilon " .repeat(40) +
                "she turned then and went out through the kitchen door " +
                "zeta eta theta iota kappa ".repeat(40)).trim();
  const words = C.normalizeWords(text);
  const expected = 205;

  const exact = C.verifyFiveWords(words, "out through the kitchen door", expected, 120);
  ok("exact phrase matches", exact.matched, JSON.stringify(exact));

  const typo = C.verifyFiveWords(words, "out throgh the kitchen dooor", expected, 120);
  ok("one typo still matches", typo.matched, JSON.stringify(typo));

  const punct = C.verifyFiveWords(words, "Out, through the Kitchen door.", expected, 120);
  ok("punctuation and capitals ignored", punct.matched);

  const nomatch = C.verifyFiveWords(words, "completely unrelated words here now", expected, 120);
  ok("unrelated text does not match", !nomatch.matched);

  // The repeat trap: a phrase occurring many times must resolve NEAR the
  // expected stop point, not at the first occurrence in the file.
  const rep = C.verifyFiveWords(words, "alpha beta gamma delta epsilon", 150, 60);
  ok("repeated phrase resolves inside the window, not at the file start",
     rep.matched && rep.position >= 90 && rep.position <= 215, JSON.stringify(rep));
  const outside = C.verifyFiveWords(words, "she turned then and went", 20, 40);
  ok("a match outside the window is correctly rejected", !outside.matched);
}

console.log("\n=== BUCKETS ===");
eq("550 words maps to a sensible bucket", C.BUCKETS[C.bucketFor(550)], 520);
eq("6200 words maps to the nearest bucket in log space", C.BUCKETS[C.bucketFor(6200)], 6700);
eq("bucket widths stay under ~25%", Math.max(...C.BUCKETS.slice(1).map((b, i) => b / C.BUCKETS[i])) < 1.25, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
