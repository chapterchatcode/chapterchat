# DECISIONS

Deliverable §8.2. Every choice made under `PROMPT_BUILD.md` §0.1, every conflict
found, and every question that would have stopped the build.

---

## 1. The closed list of decisions I was allowed to make

### 1.1 EPUB library — `jszip` + the platform `DOMParser`

**Not `epub.js`.** `epub.js` is a *rendering engine*: it wants an iframe, a
viewport, a pagination model and a spine renderer, and it is ~200 KB to get
them. We need exactly one thing from an EPUB — the spine's text in reading
order — and then we hand it to `core.ts`, which does all the real work. Pulling
in a renderer to throw away the rendering would also mean two competing ideas
about what a "page" is, in an app whose entire thesis is that the app does not
own the page.

`jszip` (~100 KB) unzips; `DOMParser` is free and already in the browser. Total
new surface: one dependency, ~90 lines in `epub.ts`.

**Consequence worth knowing:** `DOMParser` does not exist inside a Web Worker.
That is why EPUB → text runs on the main thread and only the plain text is
posted to the worker. `PROMPT_BUILD` §4 says "post the raw text in", which is
consistent with this. To keep a 100k-word EPUB from janking anyway, extraction
yields to the event loop between spine documents.

### 1.2 Router — none

Twelve screens, two real URLs (`/` and `/debug`). Everything else is a phase in
one state machine in `app.tsx`. A router library would add a dependency and,
worse, would make half-finished states deep-linkable — you could land straight
on a vote screen for a session that never happened. Keeping the flow in state
makes that unrepresentable.

### 1.3 Host — Cloudflare Pages by default, GitHub Pages with one env var

`base` defaults to `/`, which is right for Cloudflare Pages and for local
`vite preview`. For GitHub Pages:

```bash
VITE_BASE=/<repo-name>/ npm run build
```

`dist/404.html` is written at build time as the SPA fallback, all asset paths
respect `base`, and the service worker is registered with `scope:
import.meta.env.BASE_URL` so it claims the whole app and nothing above it.

### 1.4 Deckle edge

The SVG path from `mockup.html`, unchanged, full-bleed, `fill="var(--paper)"`.
No filter, no texture image.

### 1.5 Service worker

Hand-written, ~90 lines, bundled to a **stable** `dist/sw.js` by
`scripts/postbuild.mjs` (a hashed filename could never be registered). Strategy:

| Request | Strategy | Why |
|---|---|---|
| navigation | network-first, fall back to cached shell | updates land, but a plane still opens the app |
| app assets | cache-first | Vite hashes them, so a cached one is never stale |
| Google Fonts | cache-first | the only external origin in the product |
| anything else off-origin | not intercepted | nothing else should exist |

### 1.6 Test organisation

Three scripts, none shipped:

- `npm test` → `src/core.test.ts`, the given suite, unmodified. **56 passed, 0 failed.**
- `scripts/acceptance.ts` → the statically checkable half of Part 7. **24 passed, 0 failed.**
- `scripts/smoke.mjs` → a headless walk of the whole flow at 390×844 with
  screenshots. **20 passed, 0 failed.**

### 1.7 Error copy not specified in DESIGN.md

Written to the §2.16 voice — plain, specific, no apology, no exclamation mark:
"Enter your name to continue." / "That email address isn't complete." / "Use at
least six characters." / "Give the book a title to continue." / "That file
didn't open. Choose a Chapter Chat backup file." / "This book is copy-protected,
so we can't open it."

---

## 2. Things I had to decide that were NOT on the closed list

Each of these was a gap rather than a conflict. I have flagged all of them
rather than letting them pass silently.

### 2.1 Ramp A runs before Ramp B within a single session

The interlock says only one ramp may move per 7 days. Both `applyRampA` and
`applyRampB` enforce it by inspecting the *other* ramp's timestamp — so when a
session produces both a vote and a verified offline log, **whichever runs first
is the only one that can move.** `core.ts` does not order them; the call site
must.

I run **Ramp A first**. Reasoning: portion size is the measure of capability,
and the staircase's rule is that difficulty rises only after capability has
caught up. Letting the size settle first, then shifting where the reading
happens, keeps those two in the intended order. `applyRampB` is not lost work —
it banks the success (`stageSuccessCount + 1`) while refusing to advance, so the
stage moves on the next qualifying log.

**If you want B first, it is a two-line swap in `service.ts`.** Worth a decision
from you rather than from me.

### 2.2 Device preferences live in `localStorage`, not in the five stores

Text size, theme, the one-shot "nudge shown" flag, the install-prompt state, the
visit counter, and the local account record (name/email) have no field in
`core.ts` and no store in §3.1. Rather than widen `Profile` (which would mean
editing `core.ts`) or add a sixth store, they live in `localStorage` via
`prefs.ts`. They are still written into the JSON export, so a restore feels
complete.

The account record in particular is a *display* record, not an identity — there
is no server to authenticate against. See §7.5 of `CONTEXT.md`, still open.

### 2.3 A normalized word index, computed in memory, never stored

`verifyFiveWords` indexes the book as a flat array of normalized words.
`Block.startWord` in `core.ts` counts raw whitespace-separated tokens. Those two
counts drift — `word—word` is one raw token and two normalized ones — so a
matched position could map to the wrong block on a book with many em-dashes.

`service.ts` builds both the word array and the per-block offsets from the same
`normalizeWords` pass, so the two coordinate systems agree by construction. It
is derived at read time and cached in a `Map`, never persisted — invariant 4
holds.

### 2.4 WPM samples are only taken from fully in-app sessions

A part-offline session has honest word counts but no honest seconds. Feeding it
to the rolling median would inflate WPM, and WPM sets the 30-minute graduation
target — so it would quietly make graduation harder the further into Ramp B you
got. `SessionOutcome.measured` gates it.

### 2.5 The chunking fallback ladder

`PROMPT_BUILD` §4 specifies it; `core.ts` deliberately does not implement it. It
lives in `ingest.worker.ts` as four tiers — solver → widen the target 15% and
re-solve → structural markers only → fixed word count snapped to a block. The
worst tier across all 19 buckets is recorded and shown on `/debug`. On the test
fixture, all 19 buckets resolve at tier 1 (`solver`).

### 2.6 Ingest starts on file selection, not on "Continue"

`CONTEXT.md` §2.1 puts the chapter-deadline picker (step 5) before chunking
(step 6) — but the chapter list *comes from* chunking. Kicking the worker off
the moment a file is chosen means the chapters are ready by the time the form
asks for them, and the Processing screen usually completes immediately. If the
worker is still running, the picker says so plainly rather than showing an empty
list.

### 2.7 `tokens.theme.css` is generated from `tokens.css`

Settings offers light / dark / system. "System" is the media query already
inside `tokens.css`; an explicit choice needs the same values bound to
`[data-theme]`. Hand-writing them would have put colour values in a second file
and broken A11.

`scripts/gen-theme.mjs` derives them mechanically from `tokens.css` at build
time. `tokens.css` stays byte-identical to the file you supplied, and remains
the only file in which a colour is ever authored.

### 2.8 "I didn't read" is an abandon, not a failed check

`DESIGN.md` §2.11 gives the control but not the consequence. It records
`chunk_abandoned`, leaves the cursor where it was, and runs Ramp A with
`abandoned: true` — which `core.ts` scores as *Extra effort*. The vote screen is
skipped: asking how it felt when they did not read it would be asking them to
invent an answer.

---

## 3. Conflicts found between the given files

I did not stop the build for any of these, because each has an unambiguous
resolution and none changes behaviour. Flagging all of them.

### 3.1 A9 is arithmetically unsatisfiable — the one real failure

> **A9.** Reading text measures 62–66 characters at default size on a 390px viewport.

It cannot. At a 390px viewport with the specified 22px gutters the content box
is 346px. At the specified 19px reading size that is 18.2em, which measures
**≈40 characters**, not 62–66. To reach 62–66 characters you would need ~608px
of content width, or a ~10px font.

The three constraints are mutually exclusive, and two of them are hard rules
("never below 18px", "never wider than the measure"). So I implemented the rule
as stated everywhere it is stated — **19px, `max-width: 34em`** — which is
correct on a tablet or desktop, where the 34em cap actually binds. Measured in
the smoke test: `346px at 19px ≈ 40 chars`.

**A9 fails as written and I did not paper over it.** The 62–66 figure describes
what 34em *means*, not what a 390px phone can show. My reading is that the
acceptance line should say "capped at 34em; 62–66 characters where width
allows" — but that is your call, not mine.

### 3.2 Display size: 33px vs 34px

`DESIGN.md` §1.3 and `mockup.html` say 33px. `tokens.css` says
`--text-display: 2.125rem` (34px), and `PROMPT_BUILD` §0.5 says to copy
`tokens.css` in verbatim. I used the token. One pixel, flagged for completeness.

### 3.3 A18 vs the required bottom fade

A18 says "no gradient anywhere". `DESIGN.md` §2.9 requires a 90px bottom fade on
the reading screen, which is a `linear-gradient`. I read A18 as prohibiting
*decorative and chromatic* gradients. The acceptance script asserts the stricter,
checkable version: **exactly one gradient exists in the whole codebase, and it is
the reader's fade from `transparent` to `var(--page)`.**

### 3.4 A7 vs the graduation copy

A7 says nothing anywhere may display a streak. §2.17's mandated copy is "That's
not a streak. That's a reader." The check excludes that exact sentence — denying
a streak is the opposite of displaying one.

### 3.5 The handoff cue is, necessarily, one sentence of offline text

A14 says the handoff DOM must contain no offline text; §2.10 requires the
starting cue, which is by definition the first sentence of the offline portion.
Implemented as: the first sentence only, and never the remainder. The smoke test
asserts the cue is present and under 400 characters while the whole lower block
stays under 900.

---

## 4. A defect in `core.ts` — reported, not fixed

Per your rule I have not touched `core.ts`. Here is the failing case.

**Symptom.** A scene divider immediately before a chapter heading swallows that
chapter: the chapter list shows `* * *` where a title should be, and the real
title disappears.

**Reproduction** (`core.ts` only, no app code):

```ts
const text = [
  "Chapter One",
  "The tide had gone out further than anyone remembered that morning.",
  "* * *",
  "Chapter Two",
  "She had not expected the house to be so quiet when she finally arrived.",
  "Chapter Three",
  "The letter arrived on a Tuesday and said very little at all about it.",
].join("\n\n");

detectChapters(buildBlocks(parseText(text)));
```

**Got:**

```
index=1 title="Chapter One"
index=2 title="* * *"        ← should be "Chapter Two"
index=3 title="Chapter Three"
```

**Why.** `buildBlocks` merges a heading forward into the block it introduces,
and keeps merging while the *next* paragraph is also a heading — correct, and
exactly the fix noted in `CONTEXT.md` §3.4. So `* * *` + `Chapter Two` + body
become one block with `tags: ["scene_divider", "list", "chapter_start"]`.
`detectChapters` then takes `text.split("\n")[0]` as the title, which is the
divider.

**Scope.** Cosmetic and confined to the Library's chapter labels. Boundary
quality, `chapterStatus`, alignment validation and every ramp are unaffected —
the block is still correctly tagged `chapter_start`.

**Candidate one-line fix**, if you want it — in `detectChapters`, take the first
line that is not a divider:

```ts
title: blocks[s].text.split("\n").find(l => !/^\s*([*#•~\-—]\s*){3,}\s*$/.test(l.trim()))
         ?.slice(0, 80) ?? blocks[s].text.split("\n")[0].slice(0, 80),
```

I have not applied it. It is your file and it is under test.

**Second, smaller observation:** `parseText` tags `* * *` as both
`scene_divider` and `list`, because `^\s*[-*•]\s+` matches `* * *`. Harmless
today (the divider branch is checked first in `scoreGaps`), but it does mean a
divider can pull following short paragraphs into a dialogue/list run in
`buildBlocks`. Noting it; not acting on it.

---

## 5. Device tests you need to run — I cannot

These need a real iPhone; the headless run cannot substitute.

- **A3** — install to home screen, confirm `display-mode: standalone` is true.
- **A4** — `navigator.storage.persist()` result. The app requests it on every
  launch and records the outcome; it is printed on `/debug` as
  `persist() granted`. In headless Chromium it returns `false` (no engagement
  signal), which is expected and not a bug.
- **A2 (on-device)** — airplane mode. Verified headless: with the service worker
  active and the network cut, the app reloads and renders. Re-confirm on iOS
  Safari, where the storage rules differ.
- **A5** — export, wipe site data, import. The code path is symmetric and the
  backup carries profile, books, userBooks, events, sessions and prefs, but I
  have not wiped a real device.
- **A13** — dark mode on device. Verified headless: reading body contrast is
  **≥ 4.5:1** under `prefers-color-scheme: dark`.

---

## 6. The iOS storage constraint, said plainly so it is not dropped later

Safari deletes IndexedDB after **7 days of Safari use without visiting the
site.** For a daily reading app with no server that is fatal — a user who takes a
week off loses their book, their ramp and their graduation progress.

**Home-screen-installed web apps are exempt.** Installation is therefore not a
nice-to-have; it is how the data survives. All three mitigations are in:

1. `display: standalone` in the manifest, plus an install prompt on iOS Safari
   after the first reading session and again from the third visit.
2. `navigator.storage.persist()` requested on every launch, result recorded.
3. Export/import always available in Settings, plus a backup offer every tenth
   logged session, at most once a week.

**Do not remove any of the three.** They are the only thing standing between a
two-week holiday and a wiped programme.

---

## 7. What is not built

- **The wordmark face.** `TodaySHOP-MediumItalic` is not a Google Font and I have
  no file for it, and §0.3 forbids adding another font CDN. The wordmark renders
  in `"TodaySHOP-MediumItalic", Newsreader, Georgia, serif` — drop
  `TodaySHOP-MediumItalic.woff2` into `public/fonts/` and it appears with no code
  change. The `@font-face` is injected from `BASE_URL` at boot so it resolves
  under any host path.
- **Deployment.** Built and verified locally; not pushed to a host. `npm run
  build` produces a `dist/` that drops onto Cloudflare Pages as-is.
- **CONTEXT.md §7.1** — a book with no detectable chapters currently falls
  through to tier 3/4 of the ladder and is accepted silently. That is the
  unresolved question, not a decision I made; the ladder just needs *some*
  behaviour to exist.
- **§7.2, partly** — DRM'd EPUBs now fail loudly with a specific message, since
  `META-INF/encryption.xml` makes them detectable and silently ingesting noise
  is worse. If you wanted a fallback instead, it is one branch in `epub.ts`.
- **§7.3, §7.4, §7.6, §7.7** — untouched. `structure_type` is still never
  populated; there is no returning-reader recap; there is no analytics endpoint;
  the WPM threshold is still `core.ts`'s 5.
