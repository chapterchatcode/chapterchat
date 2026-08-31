import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles/app.css";

/**
 * The wordmark face is supplied by the user as a file, not by a CDN. Injecting
 * the @font-face here (rather than in the stylesheet) lets the URL be built
 * from BASE_URL, so it resolves under any host path. If the file is absent the
 * rule simply never matches and the stack falls through to Newsreader Italic.
 */
function registerWordmarkFont() {
  const base = import.meta.env.BASE_URL;
  const style = document.createElement("style");
  style.textContent = `@font-face{font-family:"TodaySHOP-MediumItalic";` +
    `src:local("TodaySHOP-MediumItalic"),` +
    `url("${base}fonts/TodaySHOP-MediumItalic.woff2") format("woff2"),` +
    `url("${base}fonts/TodaySHOP-MediumItalic.woff") format("woff"),` +
    `url("${base}fonts/TodaySHOP-MediumItalic.ttf") format("truetype");` +
    `font-weight:500;font-style:italic;font-display:swap;}`;
  document.head.appendChild(style);
}

async function boot() {
  registerWordmarkFont();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .catch(() => undefined);
    });
  }
}

void boot();
