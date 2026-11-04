/**
 * Each post's Markdown twin, /blog/<slug>.md, from its source file rather
 * than from the rendered page. The agent-markdown integration
 * (src/integrations/agent-markdown.mjs) finds it in dist/ and keeps it as
 * the twin instead of converting the HTML.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

export const getStaticPaths = (async () => {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props, site }) => {
  const { post } = props as { post: CollectionEntry<"blog"> };
  const d = post.data;
  const date = d.date.toISOString().slice(0, 10);
  const source = d.sourceUrl ? ` · [${d.sourceLabel ?? "source"}](${d.sourceUrl})` : "";
  // Site-relative links in the post would mean nothing once the file is
  // read on its own.
  const body = (post.body ?? "").replace(/\]\(\//g, `](${new URL("/", site).href}`);
  const md = `# ${d.title}\n\n> ${d.description}\n\n${date}${source}\n\n${body.trim()}\n`;
  return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
};
