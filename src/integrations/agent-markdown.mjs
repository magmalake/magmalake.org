// @ts-check
/**
 * Markdown for agents, after the llms.txt proposal (https://llmstxt.org).
 * Once `astro build` has written dist/, this integration
 *
 *   1. gives every HTML page a Markdown twin at the same URL plus `.md`
 *      (/blog/foo -> /blog/foo.md, and / -> /index.md), also written as
 *      <dir>/index.md, the spec's name for a URL without a file name;
 *   2. adds <link rel="alternate" type="text/markdown"> pointing at the twin,
 *      and <link rel="describedby"> pointing at /llms.txt, to each page;
 *   3. writes /llms.txt, an index of every page grouped by section, and
 *      /llms-full.txt, every twin in one file.
 *
 * A twin comes from one of two places. If the build already wrote
 * dist/<page>.md, from a `.md.ts` endpoint beside the page (as
 * src/pages/blog/[...slug].md.ts does from each post's Markdown source), it
 * is kept as it is. Otherwise the page's <main> is converted: navigation,
 * buttons, scripts, SVG, anything aria-hidden and anything marked
 * `data-md="skip"` is left out first, so what remains is the page's text,
 * tables and code. An element marked `data-md="list"` (a grid of boxes, say)
 * becomes a list of its children. Nothing is needed for a new page; it gets a twin, a link
 * and an entry in llms.txt on its next build.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import { NodeHtmlMarkdown } from "node-html-markdown";

/**
 * @typedef {{ title: string, match: (path: string) => boolean, optional?: boolean }} Section
 * @typedef {{
 *   name: string,
 *   summary: string,
 *   intro?: string[],
 *   sections: Section[],
 *   exclude?: (path: string) => boolean,
 *   excludeFromFull?: (path: string) => boolean,
 *   titleSuffix?: string,
 * }} Options
 */

/** Elements that are chrome or interaction, never content. */
const DROP = [
  "script", "style", "noscript", "template", "svg", "button", "nav", "form", "input",
  "[aria-hidden=true]", "[hidden]:not([role=tabpanel])", "[data-md=skip]", ".skip",
];

const nhm = new NodeHtmlMarkdown({ bulletMarker: "-", codeFence: "```", maxConsecutiveNewlines: 2 });

/** The page's <main> as Markdown, and its first <h1>'s text, taken out of it.
 * @param {string} html @param {string} site */
function toMarkdown(html, site) {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, pre: true } });
  const main = root.querySelector("main") ?? root.querySelector("body") ?? root;
  const h1 = main.querySelector("h1");
  const heading = h1?.text.replace(/\s+/g, " ").trim() ?? "";
  h1?.remove();
  for (const sel of DROP) for (const el of main.querySelectorAll(sel)) el.remove();
  // data-md="list": a row of boxes drawn as a grid is a list in the twin.
  for (const el of main.querySelectorAll("[data-md=list]")) {
    el.innerHTML = `<ul>${el.childNodes.filter((c) => c.nodeType === 1).map((c) => `<li>${c.toString()}</li>`).join("")}</ul>`;
  }
  // Eyebrows are breadcrumbs and kickers; the title says the same.
  for (const el of main.querySelectorAll(".eyebrow")) el.remove();
  for (const a of main.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    // A link to a spot on the same page means nothing in the twin.
    if (href.startsWith("#")) {
      a.replaceWith(a.innerHTML);
      continue;
    }
    if (href.startsWith("/") && !href.startsWith("//")) a.setAttribute("href", new URL(href, site).href);
  }
  for (const img of main.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("/")) img.setAttribute("src", new URL(src, site).href);
  }
  // Source line breaks are spaces, except inside <pre>: left as newlines,
  // the converter drops some of them, gluing a link to the word after it.
  const html2 = main.innerHTML
    .split(/(<pre[\s\S]*?<\/pre>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\s*\n\s*/g, " ")))
    .join("");
  const body = tidy(nhm.translate(html2));
  return { heading, body };
}

/** Outside code fences: no padding in table cells, no spaces just inside a
 * link's brackets, no stray space opening a line, no trailing spaces and no
 * runs of blank lines.
 * @param {string} md */
function tidy(md) {
  return md
    .split(/(^```[\s\S]*?^```)/m)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/^\|.*\|$/gm, (row) => row.replace(/ {2,}/g, " ").replace(/-{4,}/g, "---"))
            .replace(/^ (?=[^ ])/gm, "")
            .replace(/\[ +/g, "[")
            .replace(/ +\]\(/g, "](")
            .replace(/[ \t]+$/gm, ""),
    )
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** @param {string} html */
function headOf(html) {
  const root = parse(html.slice(0, html.indexOf("</head>") + 7));
  return {
    title: root.querySelector("title")?.text.trim() ?? "",
    description: root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "",
  };
}

/** Every HTML file under `dir`, as [file, url path]. @param {string} dir */
function pagesIn(dir, root = dir, out = /** @type {[string, string][]} */ ([])) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) pagesIn(p, root, out);
    else if (e.name === "index.html") {
      const rel = relative(root, dirname(p)).split("\\").join("/");
      out.push([p, rel ? `/${rel}` : "/"]);
    }
  }
  return out;
}

/** The twin's URL for a page's path. @param {string} path */
export const twinOf = (path) => (path === "/" ? "/index.md" : `${path}.md`);

/** @param {Options} options @returns {import("astro").AstroIntegration} */
export default function agentMarkdown(options) {
  let site = "";
  return {
    name: "agent-markdown",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = String(config.site ?? "");
      },
      "astro:build:done": ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const suffix = options.titleSuffix ?? "";
        /** @type {{ path: string, title: string, description: string, md: string }[]} */
        const pages = [];

        for (const [file, path] of pagesIn(out).sort((a, b) => a[1].localeCompare(b[1]))) {
          if (options.exclude?.(path)) continue;
          let html = readFileSync(file, "utf8");
          const head = headOf(html);
          const title = suffix && head.title.endsWith(suffix) ? head.title.slice(0, -suffix.length) : head.title;
          const twin = join(out, twinOf(path));

          let md;
          if (existsSync(twin)) {
            md = readFileSync(twin, "utf8").trim();
          } else {
            const { heading, body } = toMarkdown(html, site);
            const desc = head.description ? `> ${head.description}\n\n` : "";
            md = `# ${heading || title}\n\n${desc}${body}`;
          }
          md += `\n`;
          mkdirSync(dirname(twin), { recursive: true });
          writeFileSync(twin, md);
          if (path !== "/") writeFileSync(join(out, path, "index.md"), md);

          const links =
            `<link rel="alternate" type="text/markdown" href="${twinOf(path)}" />` +
            `<link rel="describedby" href="/llms.txt" />`;
          if (!html.includes('type="text/markdown"')) {
            html = html.replace("</head>", `${links}</head>`);
            writeFileSync(file, html);
          }
          pages.push({ path, title, description: head.description, md });
        }

        // llms.txt: the H1, the summary as a blockquote, then a list of links
        // per section. A page no section claims goes under "Other".
        const claimed = new Set();
        const lines = [`# ${options.name}`, "", `> ${options.summary}`, ""];
        for (const p of options.intro ?? []) lines.push(p, "");
        const sections = [...options.sections.filter((s) => !s.optional), { title: "Other", match: () => true }, ...options.sections.filter((s) => s.optional)];
        for (const s of sections) {
          const mine = pages.filter((p) => !claimed.has(p.path) && s.match(p.path));
          if (mine.length === 0) continue;
          lines.push(`## ${s.optional ? "Optional" : s.title}`, "");
          if (s.optional) lines.push(`${s.title}:`, "");
          for (const p of mine) {
            claimed.add(p.path);
            const url = new URL(twinOf(p.path), site).href;
            lines.push(`- [${p.title}](${url})${p.description ? `: ${p.description}` : ""}`);
          }
          lines.push("");
        }
        writeFileSync(join(out, "llms.txt"), lines.join("\n"));

        const full = pages
          .filter((p) => !options.excludeFromFull?.(p.path))
          .map((p) => `<!-- ${new URL(p.path, site).href} -->\n\n${p.md}`);
        writeFileSync(join(out, "llms-full.txt"), `# ${options.name}\n\n> ${options.summary}\n\n${full.join("\n---\n\n")}`);

        logger.info(`${pages.length} Markdown twins, llms.txt and llms-full.txt`);
      },
    },
  };
}
