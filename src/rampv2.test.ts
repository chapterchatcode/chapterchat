/* Tests for the V2 paragraph ramp. Run with: npm run test:v2 */

import {
  applyParagraphRamp, serveParagraphs, INITIAL_RAMP,
  type RampState,
} from "./rampv2.js";
import type { Rating } from "./core.js";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const VERY_COMFORTABLE: Rating = 5;
const COMFORTABLE: Rating = 4;
const JUST_RIGHT: Rating = 3;
const LITTLE_EFFORT: Rating = 2;
const EXTRA_EFFORT: Rating = 1;

/** Feeds a sequence of votes and returns the final state. */
function run(votes: Rating[], from: RampState = INITIAL_RAMP): RampState {
  return votes.reduce((s, v) => applyParagraphRamp(s, v).next, from);
}

console.log("\n=== starting size ===");
ok("everyone starts at one paragraph", INITIAL_RAMP.chunkParagraphs === 1);

console.log("\n=== growing ===");
{
  ok("one comfortable vote does not grow yet",
     run([COMFORTABLE]).chunkParagraphs === 1);
  ok("two comfortable in a row grows to two",
     run([COMFORTABLE, COMFORTABLE]).chunkParagraphs === 2);
  ok("two very comfortable in a row grows to two",
     run([VERY_COMFORTABLE, VERY_COMFORTABLE]).chunkParagraphs === 2);
  ok("comfortable then very comfortable also counts as a run",
     run([COMFORTABLE, VERY_COMFORTABLE]).chunkParagraphs === 2);
  ok("four comfortable in a row grows twice, to three",
     run([COMFORTABLE, COMFORTABLE, COMFORTABLE, COMFORTABLE]).chunkParagraphs === 3);
  const r = applyParagraphRamp({ chunkParagraphs: 1, growRun: 1, shrinkRun: 0 }, COMFORTABLE);
  ok("the run resets after a grow", r.next.growRun === 0 && r.change === "up");
}

console.log("\n=== just right holds, and breaks a run ===");
{
  ok("just right alone holds", run([JUST_RIGHT, JUST_RIGHT]).chunkParagraphs === 1);
  ok("just right between two comfortable votes prevents the grow",
     run([COMFORTABLE, JUST_RIGHT, COMFORTABLE]).chunkParagraphs === 1);
  ok("just right between two effortful votes prevents the shrink",
     run([LITTLE_EFFORT, JUST_RIGHT, LITTLE_EFFORT],
         { chunkParagraphs: 3, growRun: 0, shrinkRun: 0 }).chunkParagraphs === 3);
}

console.log("\n=== shrinking ===");
{
  const at3: RampState = { chunkParagraphs: 3, growRun: 0, shrinkRun: 0 };
  ok("one effortful vote does not shrink yet",
     run([EXTRA_EFFORT], at3).chunkParagraphs === 3);
  ok("two extra effort in a row shrinks to two",
     run([EXTRA_EFFORT, EXTRA_EFFORT], at3).chunkParagraphs === 2);
  ok("two little effort in a row shrinks to two",
     run([LITTLE_EFFORT, LITTLE_EFFORT], at3).chunkParagraphs === 2);
  ok("little effort then extra effort also counts as a run",
     run([LITTLE_EFFORT, EXTRA_EFFORT], at3).chunkParagraphs === 2);
  ok("never shrinks below one paragraph",
     run([EXTRA_EFFORT, EXTRA_EFFORT, EXTRA_EFFORT, EXTRA_EFFORT]).chunkParagraphs === 1);
  const r = applyParagraphRamp({ chunkParagraphs: 1, growRun: 0, shrinkRun: 1 }, EXTRA_EFFORT);
  ok("holding at the floor reports 'hold', not 'down'", r.change === "hold");
}

console.log("\n=== a grow vote cancels a shrink run ===");
{
  ok("effortful then comfortable then effortful does not shrink",
     run([LITTLE_EFFORT, COMFORTABLE, LITTLE_EFFORT],
         { chunkParagraphs: 4, growRun: 0, shrinkRun: 0 }).chunkParagraphs === 4);
}

console.log("\n=== serving: chunks never cross a chapter ===");
{
  const paras = ["a", "b", "c", "d", "e"];
  const first = serveParagraphs(paras, 0, 1, 1);
  ok("first session serves exactly one paragraph",
     first.paragraphs.length === 1 && first.to === 1);
  ok("it does not finish a five-paragraph chapter", !first.finishesChapter);

  const mid = serveParagraphs(paras, 2, 2, 1);
  ok("serves two from the middle", JSON.stringify(mid.paragraphs) === '["c","d"]');

  const tail = serveParagraphs(paras, 4, 3, 1);
  ok("a chunk larger than what is left is clipped, not carried over",
     tail.paragraphs.length === 1 && tail.clipped && tail.finishesChapter,
     JSON.stringify(tail));

  const exact = serveParagraphs(paras, 3, 2, 1);
  ok("a chunk that exactly reaches the end finishes the chapter",
     exact.finishesChapter && !exact.clipped);

  const past = serveParagraphs(paras, 5, 2, 1);
  ok("nothing is served past the end", past.paragraphs.length === 0 && past.finishesChapter);
}

console.log("\n=== the grown size carries over ===");
{
  // Grow to 3 in chapter one, then start chapter two from paragraph 0.
  const grown = run([COMFORTABLE, COMFORTABLE, COMFORTABLE, COMFORTABLE]);
  ok("size reached three", grown.chunkParagraphs === 3);
  const nextChapter = serveParagraphs(["p1", "p2", "p3", "p4"], 0, grown.chunkParagraphs, 2);
  ok("a new chapter opens at the carried-over size",
     nextChapter.paragraphs.length === 3 && nextChapter.from === 0,
     JSON.stringify(nextChapter));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
