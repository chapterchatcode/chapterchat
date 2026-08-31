# DECISIONS — V2

What changed from V1, and why. `DECISIONS.md` still describes V1 and is kept
because most of it (storage invariants, the iOS constraint, hosting, the
`core.ts` defect) is unchanged. Where the two disagree, this file wins.

V1 is untouched in its own folder. V2 is a copy with the edits applied.

---

## 1. The five changes you asked for

### 1.1 Book Club Code, immediately after sign-up

New screen between "Create account" and the calibration article. One field,
**Submit** and **Skip** at the bottom.

There is no server, so the code is **stored and never validated** — validating
it would mean inventing a rule the product does not have. Submitting an empty
field behaves as Skip. It is editable later in Settings, since skipping is easy
and permanent otherwise, and it shows on `/debug` so you can confirm what a
tester entered.

### 1.2 "Way to go!" — inline, never a popup

After the vote, the reader lands back on the book screen and a soft line fades
in above the book title. It is a `<p class="softline">` in the page flow with
`role="status"` — not a toast, not a modal, not a native dialog. It scrolls with
the page and is gone on the next navigation.

The line also carries the ramp result, which is where the growth becomes
visible:

| Situation | Line |
|---|---|
| Chunk grew | "Way to go! Next time we'll give you 2 paragraphs." |
| Chunk eased back | "Way to go! We'll ease back to one paragraph next time." |
| Chapter finished | "Way to go! That's the chapter done." |
| Otherwise | "Way to go!" |

The smoke test asserts no native dialog fires and no element with
`role="dialog"` exists at any point in the walk.

### 1.3 Chapters, and a navigable journey

`bookmodel.ts` replaces `epub.ts`. EPUB chapters come from the **spine** in
reading order, titled from the book's own table of contents — the EPUB 3 `nav`
document if present, otherwise the EPUB 2 `toc.ncx`, otherwise the first heading
in the file. Obvious front and back matter (cover, copyright, contents,
dedication, "about the author") is dropped, as are spine documents with fewer
than three paragraphs and under 200 words. If that filter removes everything,
it falls back to every document that has text — better a noisy list than none.

For `.txt`, chapter headings are detected by line ("Chapter One", "PART III",
a bare roman numeral or number on its own line). Fewer than two matches and the
whole file becomes a single chapter.

The book screen is now the chapter journey: a rail of chapters, each one
tappable, reading can begin at any of them. Three states only — tick (read),
filled dot (in progress), empty ring (not started) — the same three the library
already used. No percentage, no "3 of 12", no bar.

### 1.4 The chunking overhaul

`core.ts`'s layers 0–4 — gap scoring, atom merging, the 19 buckets, the DP
optimizer — are **no longer on the reading path**. `core.ts` itself is untouched
and still passes its 56 tests; it still owns dates, the 4am rollover, WPM and
graduation. The new logic is `rampv2.ts`, 130 lines, with its own 25 tests.

A paragraph is whatever sits between two line breaks. Context, dialogue, quotes
and length are all ignored, exactly as specified. One wrinkle worth knowing:
most books separate paragraphs with a **blank** line and hard-wrap inside them,
so splitting on every newline would shatter one paragraph into ten. So: if the
file contains blank lines, those are the paragraph break; if it contains none,
every line break is. Both shapes work.

The ramp:

- Everyone starts at **one paragraph**.
- **Two grow-votes in a row → +1.** Grow votes are Comfortable and Very
  comfortable.
- **Two shrink-votes in a row → −1**, floor of one. Shrink votes are Little
  effort and Extra effort.
- **Just right holds, and breaks a run** — you chose this from the three
  options. It was in both of your lists, which is why I asked.

No cooldown and no interlock: V1 allowed at most one change per two sessions,
which would make a demo look inert. Here every vote counts.

### 1.5 The size carries; the chunk does not

**Chunk size is stored per reader, not per book** (`ramp` store, single row). It
follows them into the next chapter and into the next book, which is what you
asked for.

**A chunk never crosses a chapter boundary.** If four paragraphs remain and the
chunk is three, the next session is three then one — the leftover is not topped
up from the following chapter. Finishing a chapter moves the reader to the next
unread one, at their current size. The smoke test verifies both halves.

---

## 2. The two things I asked about, and what they mean in the code

**"Just right" was in both rules.** You chose hold. It is one constant:

```ts
export const GROW_VOTES:   readonly Rating[] = [5, 4];   // rampv2.ts
export const SHRINK_VOTES: readonly Rating[] = [2, 1];
```

Moving `3` into either array changes the behaviour and the tests will tell you
immediately what it did.

**The paper migration is parked.** At one paragraph a chunk, stage 1 would move
"all but the final paragraph" offline and leave an empty reading screen. Nothing
is deleted: `Handoff.tsx`, `OfflineLog.tsx` and `DeckleEdge.tsx` are all still
in the tree, and `core.ts` still has `applyRampB` and `verifyFiveWords` under
test. No route reaches them.

Two consequences that follow from parking it, which I decided rather than asked:

- **The "Do you have a physical copy?" setup step is gone.** It existed only to
  set the track that drives Ramp B. Asking a question that now changes nothing
  is worse than not asking it. Same for the track switch in Settings and the
  once-only "get a physical copy" nudge.
- **Graduation still works.** It was always "seven qualifying days inside a
  rolling fourteen", and an in-app session of 30+ active minutes has always
  qualified — that path is untouched in `core.ts`.

---

## 3. Things I decided on my own — flagging them

**The database is renamed.** V2 uses `chapter-chat-v2`; V1 used `reading-app`.
Both run on `localhost`, which is one origin, so a shared name would have meant
V2 reading V1's word-based ramp state. Same for the `localStorage` key. Install
V2 and your V1 data is still sitting there intact. The cost: no automatic
migration, and a V1 backup file is refused with a clear message rather than
being silently misread.

**"Keep reading" survives, bounded.** The original rule was never to cut off
someone in flow. It now extends by one more paragraph and stops at the chapter
end. It does not feed the ramp — the vote does that — so someone who keeps
reading is not accidentally telling the app to grow.

**The chunk size is not displayed as a standing number.** The soft line says it
when it changes, and Settings has a plain sentence ("You're reading two
paragraphs at a time"). I did not put a counter on the book screen: the design
rules forbid a standing count tied to reading, and a number that only moves
every few sessions reads as a score. If you want one for the demo it is a
one-line add to `BookScreen.tsx` — say so and I'll put it in.

**The lead-in shrank to one sentence.** With one-paragraph chunks, two sentences
of recap could be longer than the reading. Still verbatim, still suppressed at a
chapter start or within four hours of the last session.

**The chapter-deadline picker is gone.** It was cosmetic in V1 and the chapter
journey now covers what it was gesturing at. The book-level "Finish by" date
stays, still inert.

**Dev seed removed.** `seed.ts` built V1's word-based fixtures and does not fit
this model. `?seed` no longer does anything. The demo is fast without it — one
paragraph on the first session — but if you want a pre-grown fixture user for
demoing, I'll write one.

---

## 4. What did not change

The design system, the palette, the type rules, `tokens.css` byte-for-byte, the
prohibitions, the storage invariants (append-only events, one `recordEvent`,
frozen `localDate`, heartbeat-summed sessions, current book as a query), the
service worker and offline behaviour, export/import, `/debug`, and the iOS
storage mitigations in `DECISIONS.md` §6.

`core.ts` is still byte-identical to the file you supplied, and the acceptance
script still asserts that.

---

## 5. Tests

| Command | What | Result |
|---|---|---|
| `npm test` | `core.test.ts`, the given suite, unmodified | **56 passed, 0 failed** |
| `npm run test:v2` | `rampv2.test.ts` — the new ramp and serving rules | **25 passed, 0 failed** |
| `npm run verify` | static acceptance checks | **24 passed, 0 failed** |
| `npm run smoke` | headless walk of the V2 flow at 390×844 | **24 passed, 0 failed** |

The smoke walk proves the mechanic end to end: first session is one paragraph;
one Comfortable vote does not grow it; a second in a row does, and says so; the
next session serves two; the last chunk of a chapter is clipped rather than
spilling; Chapter Three opens at the carried-over size; two effortful votes in a
row ease it back; no native dialog fires at any point.

`npm run smoke` needs Playwright, which is deliberately not a dependency:
`npm i -D playwright && npx playwright install chromium`.

---

## 6. Still open

- **§7.1 from CONTEXT.md is now moot for chunking** — a book with no detectable
  chapters becomes one long chapter and still works, since paragraphs are always
  available. It is worse as a *journey*, though: one rail entry.
- **Front-matter filtering is heuristic.** A chapter that genuinely has two
  short paragraphs will be dropped. The fallback catches the case where
  everything is dropped, not the case where one real chapter is.
- **Nothing validates a book club code**, so two testers can enter the same one
  and nothing connects them. That needs the backend the product does not have.
- **`core.ts`'s chapter-title defect** (DECISIONS.md §4) no longer affects
  anything: V2 does not call `detectChapters`.
