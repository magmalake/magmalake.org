/**
 * The API references at /s/<tin>/api, from src/data/api/<slug>.json, which
 * scripts/api-docs.mjs writes with `mojo doc` (see the README). A tin with a
 * file gets the pages; one without gets none, and no API link.
 *
 * The package's own module (its __init__) is the reference's first page;
 * every other module has a page at /s/<tin>/api/<path>, its dotted import
 * path after the package's name with the dots as slashes.
 */
import { Marked, type Tokens } from "marked";

export type Doc = { name: string; doc: string };
export type Overload = {
  signature: string;
  summary?: string;
  description?: string;
  parameters?: Doc[];
  args?: Doc[];
  returns?: string;
  raises?: string;
  constraints?: string;
  deprecated?: string;
};
export type Fn = { name: string; overloads: Overload[] };
export type Alias = { name: string; type?: string; value?: string; summary?: string; description?: string };
export type Struct = {
  name: string;
  signature: string;
  summary?: string;
  description?: string;
  parameters?: Doc[];
  traits?: string[];
  fields?: { name: string; type: string; summary?: string }[];
  aliases?: Alias[];
  functions?: Fn[];
};
export type Module = {
  path: string;
  summary?: string;
  description?: string;
  aliases?: Alias[];
  structs?: Struct[];
  traits?: Struct[];
  functions?: Fn[];
};
export type Api = {
  tin: string;
  /** null for a tin not published yet: its default branch's head. */
  version: string | null;
  rev: string;
  package: string;
  /** The package's directory in the tin's repository. */
  path: string;
  mojo: string;
  summary?: string;
  description?: string;
  modules: Module[];
};

const files = import.meta.glob<Api>("./api/*.json", { eager: true, import: "default" });
const bySlug = new Map(
  Object.entries(files).map(([file, api]) => [file.replace(/^\.\/api\/|\.json$/g, ""), api]),
);

export const apiOf = (slug: string): Api | undefined => bySlug.get(slug);
export const apiSlugs = (): string[] => [...bySlug.keys()];

/** The package's own module, and the rest in import-path order. */
export const rootOf = (api: Api): Module | undefined => api.modules.find((m) => m.path === api.package);
export const subModules = (api: Api): Module[] =>
  api.modules.filter((m) => m.path !== api.package).sort((a, b) => a.path.localeCompare(b.path));

/** A module's page under /s/<tin>/api: "" for the package's own. */
export const moduleSlug = (api: Api, m: Module): string =>
  m.path === api.package ? "" : m.path.slice(api.package.length + 1).replace(/\./g, "/");

export const apiHref = (tinSlug: string, api: Api, m?: Module): string => {
  const rest = m ? moduleSlug(api, m) : "";
  return `/s/${tinSlug}/api${rest ? `/${rest}` : ""}`;
};

/** The package's source on GitHub, at the commit the reference is from. */
export const sourceOf = (repo: string, api: Api): string => `${repo}/tree/${api.rev}/${api.path}`;

export const counts = (m: Module) => ({
  structs: m.structs?.length ?? 0,
  traits: m.traits?.length ?? 0,
  functions: m.functions?.length ?? 0,
  aliases: m.aliases?.length ?? 0,
});

/** An item's anchor on its module's page. */
export const anchorOf = (kind: string, name: string): string => `${kind}-${name}`.replace(/[^\w-]/g, "_");

// ---- docstrings ------------------------------------------------------------

/** Docstrings are Markdown, but HTML in them is text: `List<T>` in prose is
 * not a tag. Their headings sit under the item's own. */
const md = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    heading({ tokens, depth }: Tokens.Heading) {
      const d = Math.min(6, depth + 3);
      return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>\n`;
    },
  },
});

export const docHtml = (text?: string): string => (text ? (md.parse(text) as string) : "");
export const inlineHtml = (text?: string): string => (text ? (md.parseInline(text) as string) : "");

// ---- the Markdown twins ----------------------------------------------------

const block = (s?: string) => (s ? `${s}\n\n` : "");
const docs = (title: string, ds?: Doc[]) =>
  ds?.length ? `${title}:\n\n${ds.map((d) => `- \`${d.name}\`: ${d.doc}`).join("\n")}\n\n` : "";

function overloadMd(o: Overload): string {
  return (
    "```mojo\n" + o.signature + "\n```\n\n" +
    block(o.summary) +
    block(o.description) +
    docs("Parameters", o.parameters) +
    docs("Args", o.args) +
    (o.returns ? `Returns: ${o.returns}\n\n` : "") +
    (o.raises ? `Raises: ${o.raises}\n\n` : "") +
    (o.constraints ? `Constraints: ${o.constraints}\n\n` : "") +
    (o.deprecated ? `Deprecated: ${o.deprecated}\n\n` : "")
  );
}

const fnMd = (f: Fn, h: string) => `${h} \`${f.name}\`\n\n${f.overloads.map(overloadMd).join("")}`;
const aliasMd = (a: Alias, h: string) =>
  `${h} \`${a.name}\`\n\n` +
  (a.type || a.value ? "```mojo\ncomptime " + a.name + (a.type ? `: ${a.type}` : "") + (a.value ? ` = ${a.value}` : "") + "\n```\n\n" : "") +
  block(a.summary) +
  block(a.description);

function structMd(s: Struct): string {
  let out = `### \`${s.name}\`\n\n` + "```mojo\n" + s.signature + "\n```\n\n" + block(s.summary) + block(s.description);
  out += docs("Parameters", s.parameters);
  if (s.traits?.length) out += `Implements: ${s.traits.map((t) => `\`${t}\``).join(", ")}\n\n`;
  if (s.fields?.length)
    out += `Fields:\n\n${s.fields.map((f) => `- \`${f.name}: ${f.type}\`${f.summary ? `: ${f.summary}` : ""}`).join("\n")}\n\n`;
  for (const a of s.aliases ?? []) out += aliasMd(a, "####");
  for (const f of s.functions ?? []) out += fnMd(f, "####");
  return out;
}

/** A module as Markdown, for its page's twin. */
export function moduleMarkdown(m: Module): string {
  let out = block(m.summary) + block(m.description);
  if (m.structs?.length) out += `## Structs\n\n${m.structs.map(structMd).join("")}`;
  if (m.traits?.length) out += `## Traits\n\n${m.traits.map(structMd).join("")}`;
  if (m.functions?.length) out += `## Functions\n\n${m.functions.map((f) => fnMd(f, "###")).join("")}`;
  if (m.aliases?.length) out += `## Aliases\n\n${m.aliases.map((a) => aliasMd(a, "###")).join("")}`;
  return out;
}

/** Where a reference came from, in a sentence. */
export const provenance = (api: Api): string =>
  `${api.version ? `${api.tin} ${api.version}, as published on mojoshelf` : `${api.tin}, not published yet`} (commit ${api.rev.slice(0, 12)}), by \`mojo doc\` from ${api.mojo.replace(/ \(.*\)$/, "")}`;
