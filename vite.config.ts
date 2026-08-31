import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `base` is the one thing that differs between hosts.
 *   Cloudflare Pages / local preview : "/"            (default)
 *   GitHub Pages                     : "/<repo-name>/"
 * Set it at build time:  VITE_BASE=/chapterchat/ npm run build
 */
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: "es2022",
    // The service worker is built as a separate entry so it can live at the
    // root of `base` and therefore claim the whole app scope.
    rollupOptions: {
      input: { main: "index.html" },
    },
  },
  worker: { format: "es" },
});
