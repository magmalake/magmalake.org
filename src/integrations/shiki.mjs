// @ts-check
/**
 * Syntax colouring, at build time and with no client-side JavaScript.
 *
 * Shiki writes every token twice, `--shiki-light` and `--shiki-dark`, as CSS
 * custom properties. The rules in src/styles/global.css pick one from the same
 * signals the rest of the site's palette uses (prefers-color-scheme and the
 * theme toggle's data-theme), so a code block follows the toggle with no
 * script and no flash.
 *
 * One definition serves the three ways a block gets coloured:
 *   - Markdown fences, through astro.config.mjs's `markdown.shikiConfig`;
 *   - `<Code>` in .astro files (CodeBlock, CodeTabs, the API signatures);
 *   - `highlight()` below, for the places that have no component: the install
 *     tabs the remark plugin writes, and the fences in the API docstrings.
 */
import { createHighlighter } from "shiki";

/** Chosen for contrast on the site's code surfaces (4.2:1 or better in light
 * for everything but comments, 3.5:1 for comments in dark) and for hues that
 * sit with the palette: keywords in a red near the ember accent. */
export const themes = { light: "github-light", dark: "github-dark" };

/** For Astro's markdown config and the `<Code>` component. */
export const shikiOptions = { themes, defaultColor: false };

/** Languages the site's examples use, plus the aliases they are written in. */
const langs = ["mojo", "bash", "shellsession", "toml", "python", "sql", "c", "docker", "yaml", "json"];
const ALIAS = { sh: "bash", shell: "bash", console: "shellsession", dockerfile: "docker" };

const highlighter = await createHighlighter({ themes: Object.values(themes), langs });

/** The block as Shiki's `<pre class="shiki ..."><code>`; a language Shiki does
 * not have, or `text`, comes out uncoloured. The `language-` class on <code>
 * is what the Markdown twins turn into a fence's language.
 * @param {string} code @param {string} [lang] */
export function highlight(code, lang = "text") {
  const l = ALIAS[/** @type {keyof typeof ALIAS} */ (lang)] ?? lang;
  return highlighter.codeToHtml(code, {
    lang: highlighter.getLoadedLanguages().includes(l) ? l : "text",
    themes,
    defaultColor: false,
    transformers: [
      {
        code(node) {
          this.addClassToHast(node, `language-${lang}`);
        },
      },
    ],
  });
}
