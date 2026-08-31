/* Headless walk of the V2 flow at 390x844, with screenshots.
   The point of this file is to prove the four things that changed:
     1. the Book Club Code step exists right after sign-up, with Submit + Skip
     2. the book screen is a chapter journey, startable from any chapter
     3. the chunk starts at ONE paragraph and grows on two comfortable votes
     4. "Way to go!" appears inline on the book screen and never as a popup   */

/* Playwright is intentionally NOT a dependency — it pulls ~300MB of browsers
   and this script is optional. Install it only if you want to run the walk:
     npm i -D playwright && npx playwright install chromium                  */
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "\nThis script needs Playwright, which is not installed by default.\n" +
    "  npm i -D playwright\n" +
    "  npx playwright install chromium\n",
  );
  process.exit(1);
}

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const DIST = resolve(process.cwd(), "dist");
const SHOTS = resolve(process.cwd(), "shots");
if (!existsSync(SHOTS)) mkdirSync(SHOTS);

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".txt": "text/plain",
};
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = join(DIST, decodeURIComponent(url.pathname));
  if (!existsSync(p) || url.pathname === "/") p = join(DIST, "index.html");
  if (!existsSync(p)) p = join(DIST, "404.html");
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4175, r));
const BASE = "http://localhost:4175";

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${extra}`); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light",
});
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const appErrors = () =>
  errors.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_FAILED|ERR_NAME_NOT_RESOLVED/.test(e));

// Any native dialog would be a popup. Record every one; expect none.
const dialogs = [];
page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });

const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const paraCount = () => page.evaluate(() => document.querySelectorAll(".read p").length);
const softline = () => page.evaluate(() => document.querySelector(".softline")?.textContent?.trim() ?? null);

/* ---------------------------------------------------------- sign-up ----- */
console.log("\n=== 1 · book club code ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=You've lost the stamina.");
await page.click("text=Get started");
await page.fill('input[aria-label="Full name"]', "Abdul");
await page.fill('input[aria-label="Email address"]', "abdul@example.com");
await page.fill('input[aria-label="Password"]', "readinghelps");
await page.click('button.btn:has-text("Create account")');

await page.waitForSelector("text=Enter your Book Club Code", { timeout: 8000 });
await shot("v2-01-book-club-code");
ok("the code screen appears immediately after sign-up", true);
ok("it has a Submit button", await page.isVisible('button.btn:has-text("Submit")'));
ok("it has a Skip button", await page.isVisible('button:has-text("Skip")'));

await page.fill('input[aria-label="Book club code"]', "TACTIX-42");
await page.click('button.btn:has-text("Submit")');
await page.waitForSelector("text=Start with something short");
ok("submitting the code moves on to the article", true);

/* ---------------------------------------------------------- onboarding -- */
await page.click("text=Begin");
await page.waitForSelector(".read p");
await page.click('button.btn:has-text("Done")');
await page.waitForSelector("text=How did that feel?");
await page.click('.opt:has-text("Just right")');
await page.click('button.btn:has-text("Continue")');

await page.waitForSelector("text=Add your book");
await page.setInputFiles('input[type="file"]', "/tmp/the-lighthouse-keeper.txt");
await page.waitForSelector("text=chapters found", { timeout: 10000 });
const found = await page.textContent(".hint:has-text('chapters found')");
ok("the parser finds the four chapters", /4 chapters found/.test(found ?? ""), found ?? "");
await shot("v2-02-upload");

await page.click('button.btn:has-text("Continue")');
await page.waitForSelector("text=About this book");
await page.fill('input[aria-label="Title"]', "The Lighthouse Keeper");
await page.click('button.btn:has-text("Continue")');

/* ------------------------------------------------- first chunk = 1 para - */
console.log("\n=== 2 · the chunk starts at one paragraph ===");
await page.waitForSelector(".read p", { timeout: 15000 });
await page.waitForTimeout(300);
ok("the very first session serves exactly one paragraph", (await paraCount()) === 1,
   `got ${await paraCount()}`);
await shot("v2-03-first-chunk-one-paragraph");

/* ----------------------------------------------- vote 1: comfortable ---- */
console.log("\n=== 3 · Way to go, inline and not a popup ===");
await page.click('button.btn:has-text("Done")');
await page.waitForSelector("text=How did that feel?");
await page.click('.opt:has-text("Comfortable")');
await page.click('button.btn:has-text("Continue")');

await page.waitForSelector(".journey", { timeout: 8000 });
const msg1 = await softline();
ok("a soft line appears on the book screen", (msg1 ?? "").startsWith("Way to go!"), String(msg1));
ok("no native dialog was raised", dialogs.length === 0, dialogs.join(" | "));
ok("nothing is rendered as a modal", await page.evaluate(() =>
   document.querySelectorAll('[role="dialog"], .sheet, .scrim').length === 0));
ok("one comfortable vote does not grow the chunk yet",
   !/2 paragraphs/.test(msg1 ?? ""), String(msg1));
await shot("v2-04-book-screen-way-to-go");

/* ----------------------------------------------- vote 2: comfortable ---- */
console.log("\n=== 4 · two in a row grows it ===");
await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".read p");
ok("the second session is still one paragraph", (await paraCount()) === 1, `got ${await paraCount()}`);
await page.click('button.btn:has-text("Done")');
await page.click('.opt:has-text("Very comfortable")');
await page.click('button.btn:has-text("Continue")');

await page.waitForSelector(".journey");
const msg2 = await softline();
ok("the second comfortable vote in a row announces the growth",
   /2 paragraphs/.test(msg2 ?? ""), String(msg2));
await shot("v2-05-grown-to-two");

await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".read p");
ok("the next session serves two paragraphs", (await paraCount()) === 2, `got ${await paraCount()}`);
await shot("v2-06-two-paragraphs");

/* --------------------------------- chunk stops at the chapter boundary -- */
console.log("\n=== 5 · chunks never cross a chapter ===");
// Chapter One has 5 paragraphs; 1 + 1 + 2 = 4 read, so 1 remains.
await page.click('button.btn:has-text("Done")');
await page.click('.opt:has-text("Just right")');
await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".journey");
await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".read p");
ok("the last chunk of a chapter is clipped rather than spilling into the next",
   (await paraCount()) === 1, `got ${await paraCount()}`);
const title = await page.textContent(".reader__title");
ok("and it is still Chapter One", /Chapter One/.test(title ?? ""), title ?? "");

await page.click('button.btn:has-text("Done")');
await page.click('.opt:has-text("Just right")');
await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".journey");
ok("finishing a chapter says so", /chapter done/i.test((await softline()) ?? ""), String(await softline()));

/* -------------------------------------- size carries into a new chapter - */
console.log("\n=== 6 · the grown size carries over ===");
const marks = await page.evaluate(() =>
  [...document.querySelectorAll(".step")].map((s) => ({
    title: s.querySelector(".step__title")?.textContent ?? "",
    read: s.querySelector(".step__mark--read") !== null,
  })));
ok("the journey lists all four chapters", marks.length === 4, JSON.stringify(marks));
ok("Chapter One is ticked as read", marks[0]?.read === true, JSON.stringify(marks[0]));
await shot("v2-07-journey");

// Start from Chapter Three directly — reading may begin anywhere.
await page.click('.step__body:has-text("Chapter Three")');
await page.waitForSelector(".read p");
ok("a chapter can be started directly from the journey",
   /Chapter Three/.test((await page.textContent(".reader__title")) ?? ""));
ok("it opens at the carried-over size of two paragraphs",
   (await paraCount()) === 2, `got ${await paraCount()}`);
await shot("v2-08-chapter-three-two-paragraphs");

/* ------------------------------------------------------- easing off ----- */
console.log("\n=== 7 · two effortful votes ease it back ===");
await page.click('button.btn:has-text("Done")');
await page.click('.opt:has-text("Extra effort")');
await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".journey");
ok("one effortful vote does not shrink it yet",
   !/ease back/.test((await softline()) ?? ""), String(await softline()));
await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".read p");
await page.click('button.btn:has-text("Done")');
await page.click('.opt:has-text("Little effort")');
await page.click('button.btn:has-text("Continue")');
await page.waitForSelector(".journey");
const msg3 = await softline();
ok("two effortful votes in a row ease it back to one paragraph",
   /ease back to one paragraph/.test(msg3 ?? ""), String(msg3));

/* ------------------------------------------------------------- close ---- */
ok("no uncaught page errors across the whole walk", appErrors().length === 0, appErrors().join(" | "));
ok("no native popup at any point", dialogs.length === 0, dialogs.join(" | "));

console.log(`\n${pass} passed, ${fail} failed\n`);
await browser.close();
server.close();
if (fail > 0) process.exitCode = 1;
