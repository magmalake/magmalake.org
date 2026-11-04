/** The Markdown twin of one module's page in a tin's API reference. */
import type { APIRoute } from "astro";
import { slugOf, type Tin } from "../../../../data/tins";
import { apiTins } from "../../../../data/tinpages";
import { apiOf, subModules, moduleSlug, moduleMarkdown, type Module } from "../../../../data/apiref";

export function getStaticPaths() {
  return apiTins().flatMap((t) => {
    const api = apiOf(slugOf(t))!;
    return subModules(api).map((m) => ({ params: { tin: slugOf(t), module: moduleSlug(api, m) }, props: { tin: t, module: m } }));
  });
}

export const GET: APIRoute = ({ props }) => {
  const { tin, module: m } = props as { tin: Tin; module: Module };
  const md = `# ${m.path}\n\n> A module of ${tin.name}'s API.\n\n${moduleMarkdown(m)}`;
  return new Response(md.trim() + "\n", { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
};
