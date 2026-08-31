/* Two things Vite does not do for us:
   1. GitHub Pages has no SPA rewrite, so the app document is also served as
      404.html and deep links (e.g. /debug) resolve.
   2. The service worker must land at a STABLE url inside `base` — a hashed
      filename could never be registered — so it is bundled separately. */
import { build } from "esbuild";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");

const index = resolve(dist, "index.html");
if (!existsSync(index)) {
  console.error("postbuild: dist/index.html missing");
  process.exit(1);
}
copyFileSync(index, resolve(dist, "404.html"));
console.log("postbuild: dist/404.html written (SPA fallback)");

await build({
  entryPoints: [resolve(root, "src/sw.ts")],
  outfile: resolve(dist, "sw.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  logLevel: "warning",
});
console.log("postbuild: dist/sw.js bundled");
