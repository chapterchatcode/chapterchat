# Chapter Chat — V2

A client-side PWA that rebuilds reading stamina. You upload a book, it finds the
chapters, and you read **one paragraph** on your first session. Two comfortable
votes in a row and it gives you two. Two effortful ones and it eases back. The
size follows you into the next chapter and the next book.

No backend. No account server. Nothing leaves the device.

**Read `DECISIONS-V2.md` first** — it lists everything that changed from V1 and
why. `DECISIONS.md` is the V1 record, still accurate where V2 didn't touch it.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

V2 uses its own IndexedDB database, so running it does not touch your V1 data.

## Verify it

```bash
npm test               # core.test.ts — the given suite.   56 passed, 0 failed
npm run test:v2        # the V2 paragraph ramp.            25 passed, 0 failed
npm run verify         # static acceptance checks.         24 passed, 0 failed
npm run smoke          # headless V2 walk + screenshots.   24 passed, 0 failed
```

`npm run smoke` needs a `dist/`, so run `npm run build` first. It writes
screenshots to `shots/`.

## Build and deploy

```bash
npm run build                              # Cloudflare Pages, or local preview
VITE_BASE=/<repo-name>/ npm run build      # GitHub Pages
```

`dist/` is a folder of static files. `404.html` is written automatically as the
SPA fallback; `sw.js` is bundled to a stable path so it can be registered.

## The wordmark

The home screen sets "Chapter Chat" in `TodaySHOP-MediumItalic`. That file is
not included. Drop `TodaySHOP-MediumItalic.woff2` (and/or `.woff`, `.ttf`) into
`public/fonts/` and it is picked up with no code change. Until then it falls
through to Newsreader Italic.

## Shape

```
src/
  core.ts          GIVEN, byte-identical. Still owns dates, WPM and graduation.
                   Its chunking layers are no longer on the reading path.
  core.test.ts     GIVEN. Must keep passing.
  bookmodel.ts     NEW. .txt/.epub → chapters → paragraphs. Replaces epub.ts.
  rampv2.ts        NEW. The paragraph ramp: +1 / -1 on two votes in a row.
  rampv2.test.ts   NEW. 25 tests for the above.
  service.ts       Calls core.ts and rampv2.ts at the right moments.
  storage.ts       IndexedDB "chapter-chat-v2". One recordEvent() choke point.
  prefs.ts         Device preferences + the book club code (localStorage).
  sw.ts            Service worker.
  app.tsx          The state machine over the screens.
  screens/         Welcome Auth BookClubCode ArticleIntro Reading Vote Setup
                   BookScreen Library Settings Graduation Debug
                   Handoff, OfflineLog — PARKED. Present, never routed to.
  components/      Button OptionPill ChoiceCard Input StepBar Card
                   DeckleEdge Staircase Wordmark
  styles/
    tokens.css       GIVEN, byte-identical. The only file a colour is authored in.
    tokens.theme.css GENERATED from tokens.css. Do not edit.
```

## Two things that will look like bugs and are not

**`/debug` is not linked from anywhere.** Type the URL. With no backend the
success metric cannot be measured centrally, so this is how the funnel is read
off a device during testing. It has a Copy JSON button.

**Nothing shows progress.** No percentage, no page count, no time remaining, no
streak, no day counter, no scrollbar on the reading screen. That is the product,
not an oversight. The one permitted progress indicator is the Processing bar,
because it describes a machine rather than a person.
