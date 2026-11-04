/**
 * The Markdown twin of /s/<tin>/api, from the same JSON as the page. The
 * agent-markdown integration keeps it rather than converting the HTML.
 */
import type { APIRoute } from "astro";
import { slugOf, type Tin } from "../../../data/tins";
import { apiTins } from "../../../data/tinpages";
import { apiOf, rootOf, subModules, apiHref, moduleMarkdown, provenance } from "../../../data/apiref";

export function getStaticPaths() {
  return apiTins().map((t) => ({ params: { tin: slugOf(t) }, props: { tin: t } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const { tin } = props as { tin: Tin };
  const slug = slugOf(tin);
  const api = apiOf(slug)!;
  const root = rootOf(api);
  const mods = subModules(api);
  const abs = (p: string) => new URL(`${p}.md`, site).href;
  let md = `# ${tin.name} API reference\n\n> The \`${api.package}\` package, from ${provenance(api)}.\n\n`;
  if (mods.length)
    md += `## Modules\n\n${mods.map((m) => `- [${m.path}](${abs(apiHref(slug, api, m))})${m.summary ? `: ${m.summary}` : ""}`).join("\n")}\n\n`;
  if (root) md += moduleMarkdown(root);
  return new Response(md.trim() + "\n", { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
};
