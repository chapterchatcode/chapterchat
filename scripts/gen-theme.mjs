/* ============================================================================
   Generates src/styles/tokens.theme.css FROM tokens.css.

   Settings offers light / dark / system. "System" is handled by the media query
   already inside tokens.css; an explicit choice needs the same values bound to
   [data-theme] instead. Hand-writing them would put colour values in a second
   place — so this derives them mechanically. tokens.css stays the only file a
   colour is ever authored in, and the generated file is never edited.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const src = resolve(process.cwd(), "src/styles/tokens.css");
const out = resolve(process.cwd(), "src/styles/tokens.theme.css");
const css = readFileSync(src, "utf8");

/** Pulls `--name: value;` pairs out of a block of CSS. */
function decls(block) {
  return [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]);
}

function firstRootBlock(text) {
  const i = text.indexOf(":root");
  const open = text.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) return text.slice(open + 1, j);
  }
  throw new Error("gen-theme: no :root block in tokens.css");
}

function darkBlock(text) {
  const m = text.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/);
  if (!m) throw new Error("gen-theme: no dark media query in tokens.css");
  const open = text.indexOf("{", m.index);
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) return text.slice(open + 1, j);
  }
  throw new Error("gen-theme: unterminated dark media query");
}

// Only surface/ink/rule/alert tokens flip with the theme. Type, space, shape and
// motion tokens are identical in both, so re-emitting them would be noise.
const COLOUR = /^--(paper|paper-raised|page|ink|ink-2|ink-3|rule|rule-soft|alert|shadow-sheet)$/;

const light = decls(firstRootBlock(css)).filter(([k]) => COLOUR.test(k));
const dark = decls(darkBlock(css)).filter(([k]) => COLOUR.test(k));

const emit = (sel, pairs) =>
  `${sel} {\n${pairs.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`;

writeFileSync(
  out,
  `/* GENERATED FROM tokens.css BY scripts/gen-theme.mjs — DO NOT EDIT.
   Every value here is copied verbatim from tokens.css so that colours are
   authored in exactly one file. Regenerate with: npm run gen:theme          */

${emit("html[data-theme='light']", light)}
${emit("html[data-theme='dark']", dark)}`,
  "utf8",
);

console.log(`gen-theme: wrote tokens.theme.css (${light.length} light, ${dark.length} dark)`);
