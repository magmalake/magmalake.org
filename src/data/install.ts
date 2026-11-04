/**
 * Installing a tin, two ways: with mojoshelf's `pixi shelf add`, or with
 * plain pixi as a git dependency at the commit the tin's version was
 * published from (src/data/tincommits.json, from scripts/tin-commits.mjs).
 * The tin pages, Orca's and Dista's docs, getting started and the tindocs
 * Markdown (src/integrations/install-tabs.mjs) all build their install tabs
 * here.
 */
import { tins, type Tin } from "./tins";
import commits from "./tincommits.json";

/** mojoshelf's own install instructions: where a page's first mention of
 * mojoshelf or `pixi shelf` links. */
export const MOJOSHELF_INSTALL = "https://mojoshelf.org/getting-started";

/** What a new project needs before any tin, with or without mojoshelf. */
export const PREREQS = [
  "pixi init app -c https://conda.modular.com/max -c conda-forge && cd app",
  `sed -i.bak 's/^\\[workspace\\]/[workspace]\\npreview = ["pixi-build"]/' pixi.toml`,
  `pixi add "mojo-compiler==1.2.0"`,
];

/** Why the plain route can go wrong, as shell comments above its command. */
export const PLAIN_CAVEAT = [
  "# Without mojoshelf: the tin as a git dependency at its published commit.",
  "# Transitive dependencies may be wrong: pixi takes the tin's own git deps as",
  "# pinned in its pixi.toml, which may not match what other tins pin, and then",
  '# fails with "duplicate records". mojoshelf picks revisions that agree.',
];

type Commit = { version: string; commit: string; subdirectory?: string };
const COMMITS = commits as Record<string, Commit>;

/** The plain pixi command for a published tin. */
export function plainAddOf(t: Tin): string {
  const c = COMMITS[t.pkg];
  if (!c) throw new Error(`${t.pkg} has no commit in src/data/tincommits.json: run scripts/tin-commits.mjs`);
  if (c.version !== t.version)
    throw new Error(`${t.pkg}: tins.ts says ${t.version}, tincommits.json ${c.version}: run scripts/tin-commits.mjs`);
  const sub = c.subdirectory ? ` --subdirectory ${c.subdirectory}` : "";
  return `pixi add ${t.pkg} --git ${t.repo} --rev ${c.commit}${sub}`;
}

export const tinByPkg = (pkg: string): Tin | undefined => tins.find((t) => t.pkg === pkg);

export type Tab = { id: string; label: string; code: string; note?: string; href?: string; mojo?: boolean };

const SHELF_NOTE = `<code>pixi shelf</code> comes with mojoshelf: <a href="${MOJOSHELF_INSTALL}" rel="noopener">install it first</a>.`;
const PLAIN_NOTE = `No mojoshelf needed. If pixi reports duplicate records, the mojoshelf tab picks revisions that agree.`;

/**
 * The two install tabs for a block of shell holding `pixi shelf add <pkg>`.
 * `shelf` is the block as written; the plain tab swaps that line for the git
 * dependency, and puts the prerequisites first when the block lacks them.
 */
export function installTabs(id: string, shelf: string): Tab[] {
  const lines = shelf.split("\n");
  const at = lines.findIndex((l) => /^pixi shelf add \S+/.test(l));
  if (at < 0) throw new Error(`no \`pixi shelf add\` in: ${shelf}`);
  const pkg = lines[at].split(/\s+/)[3];
  const t = tinByPkg(pkg);
  if (!t) throw new Error(`\`pixi shelf add ${pkg}\`: no such tin in tins.ts`);
  const before = lines.slice(0, at);
  const prereqs = before.some((l) => l.startsWith("pixi init")) ? [] : PREREQS;
  const plain = [...prereqs, ...before, ...PLAIN_CAVEAT, plainAddOf(t), ...lines.slice(at + 1)];
  return [
    { id: `${id}-shelf`, label: "mojoshelf", code: shelf, note: SHELF_NOTE },
    { id: `${id}-pixi`, label: "plain pixi", code: plain.join("\n"), note: PLAIN_NOTE },
  ];
}
