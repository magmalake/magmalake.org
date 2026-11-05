// @ts-check
/**
 * A remark plugin for the tindocs Markdown (src/content/tindocs/):
 *
 *   1. a shell block holding `pixi shelf add <pkg>` becomes two tabs, the
 *      block as written and the same install with plain pixi, from
 *      installTabs in src/data/install.ts. The markup is CodeTabs.astro's;
 *      its styles and script are loaded by src/pages/s/[tin]/docs.astro;
 *   2. the first mention of mojoshelf or `pixi shelf` before that block links
 *      to mojoshelf's install instructions. The mojoshelf tab's note links
 *      there too, so a page whose first mention is the block needs no more.
 */
import { installTabs, MOJOSHELF_INSTALL } from "../data/install.ts";

/** @param {string} s */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** CodeTabs.astro's markup, with a Copy button on each panel.
 * @param {import("../data/install.ts").Tab[]} tabs */
function tabsHtml(tabs) {
  const bar = tabs
    .map(
      (t, i) =>
        `<button class="codetabs__tab" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" type="button">${esc(t.label)}</button>`,
    )
    .join("");
  const panels = tabs
    .map(
      (t, i) =>
        `<div class="codetabs__panel codetabs__panel--copy" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}"${i === 0 ? "" : " hidden"}>` +
        `<p class="codetabs__twin">${esc(t.label)}:</p>` +
        `<button type="button" class="codeblock__copy" data-copy data-pagefind-ignore aria-label="Copy the code">Copy</button>` +
        `<pre><code>${esc(t.code)}</code></pre>` +
        (t.note ? `<p class="codetabs__note">${t.note}</p>` : "") +
        `</div>`,
    )
    .join("");
  return `<div class="codetabs codetabs--install" data-codetabs><div class="codetabs__bar" role="tablist" aria-label="Install">${bar}</div>${panels}</div>`;
}

const SHELL = new Set(["sh", "bash", "shell", "console"]);
const MENTION = /mojoshelf/;

export default function installTabsPlugin() {
  /** @param {any} tree @param {{ path?: string }} file */
  return (tree, file) => {
    // The blog keeps its blocks as written: its twins are its Markdown source.
    if (!/[\\/]content[\\/]tindocs[\\/]/.test(file.path ?? "")) return;
    let n = 0;
    let linked = false;

    /** @param {any} node */
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const c = node.children[i];
        if (c.type === "code" && SHELL.has(c.lang ?? "") && /^pixi shelf add \S+/m.test(c.value)) {
          node.children[i] = { type: "html", value: tabsHtml(installTabs(`install-${++n}`, c.value)) };
          linked = true;
          continue;
        }
        if (c.type === "link") continue;
        if (!linked && c.type === "inlineCode" && c.value.startsWith("pixi shelf")) {
          node.children[i] = { type: "link", url: MOJOSHELF_INSTALL, children: [c] };
          linked = true;
          continue;
        }
        if (!linked && c.type === "text" && MENTION.test(c.value)) {
          const m = /** @type {RegExpExecArray} */ (MENTION.exec(c.value));
          const parts = [
            { type: "text", value: c.value.slice(0, m.index) },
            { type: "link", url: MOJOSHELF_INSTALL, children: [{ type: "text", value: m[0] }] },
            { type: "text", value: c.value.slice(m.index + m[0].length) },
          ].filter((p) => p.type !== "text" || p.value);
          node.children.splice(i, 1, ...parts);
          i += parts.length - 1;
          linked = true;
          continue;
        }
        walk(c);
      }
    };
    walk(tree);
  };
}
