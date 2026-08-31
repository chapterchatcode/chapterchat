/* ============================================================================
   V2 BOOK MODEL — chapters and paragraphs. Nothing else.
   ----------------------------------------------------------------------------
   V1 treated the book as one long stream of scored blocks and solved for
   boundaries with a DP optimizer (core.ts layers 0-4). V2 replaces that
   entirely for the reading path:

       a book is a list of chapters
       a chapter is a list of paragraphs
       a paragraph is whatever sits between two line breaks

   No gap scoring, no atoms, no buckets, no optimizer. Deliberately naive:
   context, dialogue, quotes and short paragraphs are all ignored, exactly as
   specified. `core.ts` is untouched and still owns dates, WPM and graduation.
   ========================================================================== */

import JSZip from "jszip";

export interface Chapter {
  /** 1-based, and stable — it is what progress is keyed on. */
  index: number;
  title: string;
  paragraphs: string[];
}

export interface ParsedBook {
  title?: string;
  author?: string;
  format: "txt" | "epub";
  chapters: Chapter[];
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_ERROR = "That file didn't open. Try a .txt or .epub under 10 MB.";

export class ReadableFileError extends Error {}

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------ plain text -- */

const CHAPTER_LINE =
  /^\s*((chapter|part|book|section)\s+([\divxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b.*|[IVXLC]+\.?|\d{1,3}\.?)\s*$/i;

/**
 * Splits raw text into paragraphs.
 *
 * Most books separate paragraphs with a blank line and hard-wrap inside them,
 * so splitting on every newline would shatter one paragraph into ten. But some
 * files use one line per paragraph and no blank lines at all. So: if the file
 * contains blank lines, they are the paragraph break; if it does not, every
 * line break is.
 */
export function splitParagraphs(raw: string): string[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/ /g, " ");
  const hasBlankLines = /\n[ \t]*\n/.test(text);
  const parts = hasBlankLines ? text.split(/\n[ \t]*\n+/) : text.split(/\n+/);
  return parts.map(tidy).filter((p) => p.length > 0);
}

export function txtToBook(raw: string): ParsedBook {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) throw new ReadableFileError(FILE_ERROR);

  const lines = text.split("\n");
  const marks: { line: number; title: string }[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t && t.length <= 60 && CHAPTER_LINE.test(t)) marks.push({ line: i, title: t });
  });

  const chapters: Chapter[] = [];
  if (marks.length >= 2) {
    marks.forEach((m, k) => {
      const end = k + 1 < marks.length ? marks[k + 1].line : lines.length;
      const body = lines.slice(m.line + 1, end).join("\n");
      const paragraphs = splitParagraphs(body);
      if (paragraphs.length > 0) {
        chapters.push({ index: chapters.length + 1, title: m.title, paragraphs });
      }
    });
    // Anything before the first heading is front matter; drop it.
  }

  if (chapters.length === 0) {
    chapters.push({ index: 1, title: "The whole book", paragraphs: splitParagraphs(text) });
  }
  if (chapters.every((c) => c.paragraphs.length === 0)) throw new ReadableFileError(FILE_ERROR);
  return { format: "txt", chapters };
}

/* ------------------------------------------------------------------ epub -- */

const BLOCKS = "p, li, blockquote, pre, h1, h2, h3, h4, h5, h6";
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIP_TITLES =
  /^(cover|title\s*page|copyright|contents|table\s+of\s+contents|dedication|acknowledge?ments?|about\s+the\s+author|colophon|imprint|also\s+by)\b/i;

interface RawDoc {
  href: string;
  heading: string | null;
  paragraphs: string[];
}

function docToParagraphs(xhtml: string): RawDoc {
  const strict = new DOMParser().parseFromString(xhtml, "application/xhtml+xml");
  const doc = strict.getElementsByTagName("parsererror").length
    ? new DOMParser().parseFromString(xhtml, "text/html")
    : strict;

  doc.querySelectorAll("script, style, head, nav, svg").forEach((n) => n.remove());

  let heading: string | null = null;
  const paragraphs: string[] = [];

  doc.querySelectorAll(BLOCKS).forEach((el) => {
    const text = tidy(el.textContent ?? "");
    if (!text) return;
    const tag = el.tagName.toLowerCase();
    // The first heading names the chapter; it is not itself a paragraph.
    if (heading === null && HEADINGS.has(tag) && text.length <= 90) {
      heading = text;
      return;
    }
    paragraphs.push(text);
  });

  if (paragraphs.length === 0) {
    const body = tidy(doc.body?.textContent ?? "");
    if (body) paragraphs.push(...splitParagraphs(body));
  }
  return { href: "", heading, paragraphs };
}

function resolveRelative(base: string, rel: string): string {
  const decoded = decodeURIComponent(rel.split("#")[0]);
  if (!base) return decoded;
  const parts = base.split("/").slice(0, -1);
  for (const seg of decoded.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Titles from the EPUB's own table of contents, keyed by spine file path. */
async function tocTitles(zip: JSZip, opfPath: string, opf: Document): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  const add = (href: string | null | undefined, label: string | null | undefined) => {
    if (!href || !label) return;
    const path = resolveRelative(opfPath, href);
    if (!out.has(path)) out.set(path, tidy(label));
  };

  // EPUB 3: a nav document with epub:type="toc"
  const navItem = Array.from(opf.querySelectorAll("manifest > item")).find(
    (i) => (i.getAttribute("properties") ?? "").split(/\s+/).includes("nav"),
  );
  if (navItem) {
    const navPath = resolveRelative(opfPath, navItem.getAttribute("href") ?? "");
    const f = zip.file(navPath);
    if (f) {
      const nav = new DOMParser().parseFromString(await f.async("string"), "application/xhtml+xml");
      nav.querySelectorAll("nav a").forEach((a) => {
        const href = a.getAttribute("href");
        add(href ? resolveRelative(navPath, href) : null, a.textContent);
      });
      if (out.size) return out;
    }
  }

  // EPUB 2: toc.ncx
  const ncxId = opf.querySelector("spine")?.getAttribute("toc");
  const ncxItem = ncxId
    ? opf.querySelector(`manifest > item[id="${CSS.escape(ncxId)}"]`)
    : Array.from(opf.querySelectorAll("manifest > item")).find((i) =>
        (i.getAttribute("href") ?? "").endsWith(".ncx"),
      );
  if (ncxItem) {
    const ncxPath = resolveRelative(opfPath, ncxItem.getAttribute("href") ?? "");
    const f = zip.file(ncxPath);
    if (f) {
      const ncx = new DOMParser().parseFromString(await f.async("string"), "application/xml");
      ncx.querySelectorAll("navPoint").forEach((np) => {
        const href = np.querySelector("content")?.getAttribute("src");
        const label = np.querySelector("navLabel > text")?.textContent;
        add(href ? resolveRelative(ncxPath, href) : null, label);
      });
    }
  }
  return out;
}

export async function epubToBook(file: File): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(file);

  if (zip.file("META-INF/encryption.xml")) {
    throw new ReadableFileError("This book is copy-protected, so we can't open it.");
  }

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new ReadableFileError(FILE_ERROR);
  const container = new DOMParser().parseFromString(
    await containerFile.async("string"), "application/xml",
  );
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new ReadableFileError(FILE_ERROR);

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new ReadableFileError(FILE_ERROR);
  const opf = new DOMParser().parseFromString(await opfFile.async("string"), "application/xml");

  const meta = (tag: string) => {
    const el = Array.from(opf.getElementsByTagName("*")).find((e) => e.localName === tag);
    return el?.textContent?.trim() || undefined;
  };

  const hrefById = new Map<string, string>();
  opf.querySelectorAll("manifest > item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) hrefById.set(id, href);
  });

  const spine: string[] = [];
  opf.querySelectorAll("spine > itemref").forEach((ref) => {
    const idref = ref.getAttribute("idref");
    const href = idref ? hrefById.get(idref) : undefined;
    if (href) spine.push(resolveRelative(opfPath, href));
  });
  if (spine.length === 0) throw new ReadableFileError(FILE_ERROR);

  const titles = await tocTitles(zip, opfPath, opf);

  const docs: RawDoc[] = [];
  for (const path of spine) {
    const entry = zip.file(path);
    if (!entry) continue;
    const d = docToParagraphs(await entry.async("string"));
    d.href = path;
    docs.push(d);
    await nextTick();     // keep the main thread responsive on a large book
  }

  // Front and back matter are spine documents too. Drop the obvious ones so the
  // chapter journey shows chapters rather than a copyright page.
  const chapters: Chapter[] = [];
  for (const d of docs) {
    const title = titles.get(d.href) ?? d.heading ?? "";
    const words = d.paragraphs.join(" ").split(/\s+/).length;
    const looksLikeMatter = SKIP_TITLES.test(title);
    if (d.paragraphs.length === 0) continue;
    if (looksLikeMatter) continue;
    if (d.paragraphs.length < 3 && words < 200) continue;
    chapters.push({
      index: chapters.length + 1,
      title: title || `Chapter ${chapters.length + 1}`,
      paragraphs: d.paragraphs,
    });
  }

  // If filtering was too aggressive, fall back to every document with text.
  if (chapters.length === 0) {
    docs.filter((d) => d.paragraphs.length > 0).forEach((d, i) => {
      chapters.push({
        index: i + 1,
        title: titles.get(d.href) ?? d.heading ?? `Chapter ${i + 1}`,
        paragraphs: d.paragraphs,
      });
    });
  }
  if (chapters.length === 0) throw new ReadableFileError(FILE_ERROR);

  return { title: meta("title"), author: meta("creator"), format: "epub", chapters };
}

export async function parseBookFile(file: File): Promise<ParsedBook> {
  if (file.size > MAX_FILE_BYTES) throw new ReadableFileError(FILE_ERROR);
  const name = file.name.toLowerCase();
  if (name.endsWith(".epub")) return epubToBook(file);
  if (name.endsWith(".txt")) return txtToBook(await file.text());
  throw new ReadableFileError(FILE_ERROR);
}

/* ------------------------------------------------------------- progress -- */

export function chapterParagraphCount(c: Chapter): number {
  return c.paragraphs.length;
}

export type ChapterState = "read" | "reading" | "unread";

export function chapterState(c: Chapter, readCount: number): ChapterState {
  if (readCount >= c.paragraphs.length) return "read";
  if (readCount > 0) return "reading";
  return "unread";
}
