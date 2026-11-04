#!/usr/bin/env node
// Regenerates src/data/api/<slug>.json, the API reference /s/<tin>/api renders.
//
//   node scripts/api-docs.mjs            every tin in src/data/tins.ts
//   node scripts/api-docs.mjs iceberg    just these slugs
//
// For each tin it asks mojoshelf which commit its version was published from
// (`pixi shelf info <pkg>`), exports that commit of the repo, and runs
// `mojo doc` over the tin's package with every other tin's sources on the
// include path. The toolchain is the one pinned in scripts/api-docs/pixi.toml.
// The JSON it writes is trimmed to what the page uses and carries the version
// and commit it came from, so a diff of src/data/api shows what changed.
//
// Needs git, pixi with the shelf extension, and the network. Cloudflare's build
// has none of that and doesn't run this: the JSON is committed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = join(SITE, "scripts", "api-docs");
const CACHE = join(SITE, ".cache", "api-docs");
const OUT = join(SITE, "src", "data", "api");

const { tins, slugOf, statusOf } = await import(join(SITE, "src", "data", "tins.ts"));

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });

/** The commit mojoshelf published `t.version` from, or the default branch's
 * head for a tin that isn't published yet. */
function revOf(t) {
  if (statusOf(t) === "shelf") {
    const info = run("pixi", ["shelf", "info", t.pkg]);
    const line = info.split("\n").find((l) => l.trim().startsWith(`${t.version} (`));
    if (!line) throw new Error(`${t.pkg} ${t.version} is not in \`pixi shelf info\``);
    return line.trim().split(/[()]/)[1];
  }
  return "HEAD";
}

/** Exports `rev` of the tin's repo to CACHE/src/<slug>; returns the full sha. */
function fetchSource(t, rev) {
  const name = t.repo.split("/").pop();
  const bare = join(CACHE, "repos", `${name}.git`);
  if (!existsSync(bare)) {
    mkdirSync(dirname(bare), { recursive: true });
    run("git", ["clone", "-q", "--bare", "--filter=blob:none", t.repo, bare]);
  } else {
    run("git", ["--git-dir", bare, "fetch", "-q", "origin", "+refs/heads/*:refs/heads/*"]);
  }
  const sha = run("git", ["--git-dir", bare, "rev-parse", `${rev}^{commit}`]).trim();
  const dest = join(CACHE, "src", slugOf(t));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const tar = execFileSync("git", ["--git-dir", bare, "archive", sha], { maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", dest], { input: tar });
  for (const d of EXTRA[slugOf(t)]?.drop ?? []) rmSync(join(dest, d), { recursive: true, force: true });
  return sha;
}

/** A file with a top-level main() is a program, and `mojo doc` refuses a
 * package holding one (lint's CLI lives in its package): leave it out. */
function dropPrograms(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) dropPrograms(p);
    else if (e.name.endsWith(".mojo") && e.name !== "__init__.mojo") {
      // Docstrings often show a main(); only code counts.
      const code = readFileSync(p, "utf8").replace(/"""[\s\S]*?"""/g, "");
      if (/^def main\(/m.test(code)) rmSync(p);
    }
  }
}

/** Per tin, by slug: directories (in its checkout) to add to the include
 * path, and directories to leave out of its docs. threads picks its compat
 * module by include path; json_mlake's GPU parser needs MAX, which the
 * toolchain here doesn't install. */
const EXTRA = {
  threads: { include: ["compat"] },
  json_mlake: { drop: ["json/gpu"] },
};

const SKIP = new Set(["tests", "test", "bench", "benches", "benchmarks", "examples", "fuzz", "scripts", "tools", "docs", "shelf", ".pixi", "build"]);

/** Every Mojo package in a checkout: a directory with an __init__.mojo whose
 * parent has none. */
function packagesIn(root, dir = root, found = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (existsSync(join(p, "__init__.mojo"))) found.push(relative(root, p));
    else packagesIn(root, p, found);
  }
  return found;
}

/** The package a tin documents: `api` in tins.ts, or the checkout's only one. */
function packageOf(t, root) {
  if (t.api) return t.api;
  const pkgs = packagesIn(root);
  if (pkgs.length !== 1) throw new Error(`${t.name}: ${pkgs.length} packages (${pkgs.join(", ")}); set \`api\` in tins.ts`);
  return pkgs[0];
}

// ---- trimming -------------------------------------------------------------

const isPublic = (name) => !name.startsWith("_") || name === "__init__" || /^__\w+__$/.test(name);
const text = (s) => (s ?? "").trim();

// Arguments and parameters are kept only when they have a doc: the
// signature already shows their names, types and defaults.
const documented = (xs) => (xs ?? []).filter((x) => text(x.description)).map((x) => ({ name: x.name, doc: text(x.description) }));
/** Leaves out empty strings and lists, so the JSON holds only what's there. */
const prune = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== false && v != null && !(Array.isArray(v) && v.length === 0)));
// Traits every struct conforms to, which say nothing about this one.
const IMPLICIT = new Set(["AnyType", "Deinitable", "UnknownDestructibility"]);

const overload = (o) => prune({
  signature: o.signature,
  summary: text(o.summary),
  description: text(o.description),
  parameters: documented(o.parameters),
  args: documented(o.args),
  returns: text(o.returnsDoc),
  raises: text(o.raisesDoc),
  constraints: text(o.constraints),
  deprecated: text(o.deprecated),
});

// The copy and move constructors the compiler synthesizes for every
// Copyable and Movable struct: listed by its traits already.
const SYNTHESIZED = /^def __init__\(out self, \*, (copy: Self|deinit take: Self|deinit move: Self)\)$/;
const fn = (f) => ({ name: f.name, overloads: f.overloads.filter((o) => !SYNTHESIZED.test(o.signature)).map(overload) });
const nonEmpty = (f) => f.overloads.length > 0;
const alias = (a) => prune({ name: a.name, type: a.type, value: a.value, summary: text(a.summary), description: text(a.description) });

const struct = (s) => prune({
  name: s.name,
  signature: s.signature,
  summary: text(s.summary),
  description: text(s.description),
  parameters: documented(s.parameters),
  traits: (s.parentTraits ?? []).map((p) => p.name).filter((n) => !IMPLICIT.has(n)),
  fields: (s.fields ?? []).filter((f) => isPublic(f.name)).map((f) => prune({ name: f.name, type: f.type, summary: text(f.summary) })),
  aliases: (s.aliases ?? []).filter((a) => isPublic(a.name)).map(alias),
  functions: (s.functions ?? []).filter((f) => isPublic(f.name)).map(fn).filter(nonEmpty),
});

const mod = (m, path) => prune({
  path,
  summary: text(m.summary),
  description: text(m.description),
  aliases: (m.aliases ?? []).filter((a) => isPublic(a.name)).map(alias),
  structs: (m.structs ?? []).filter((s) => isPublic(s.name)).map(struct),
  traits: (m.traits ?? []).filter((s) => isPublic(s.name)).map(struct),
  functions: (m.functions ?? []).filter((f) => isPublic(f.name)).map(fn),
});

/** Flattens the package tree into modules named by their import path. */
function flatten(pkg, prefix, out = []) {
  for (const m of pkg.modules ?? []) {
    if (m.name === "__init__") out.push(mod(m, prefix));
    else if (!m.name.startsWith("_")) out.push(mod(m, `${prefix}.${m.name}`));
  }
  for (const p of pkg.packages ?? []) if (!p.name.startsWith("_")) flatten(p, `${prefix}.${p.name}`, out);
  return out;
}

/** Documented / documentable, over modules, structs, traits, aliases and
 * every function overload (dunders other than __init__ are not counted). */
export function coverage(api) {
  let all = 0, doc = 0;
  const count = (summary) => { all++; if (summary) doc++; };
  const fns = (fs) => fs.filter((f) => !/^__\w+__$/.test(f.name) || f.name === "__init__").forEach((f) => f.overloads.forEach((o) => count(o.summary)));
  for (const m of api.modules) {
    count(m.summary);
    (m.aliases ?? []).forEach((a) => count(a.summary));
    fns(m.functions ?? []);
    for (const s of [...(m.structs ?? []), ...(m.traits ?? [])]) {
      count(s.summary);
      (s.aliases ?? []).forEach((a) => count(a.summary));
      fns(s.functions ?? []);
    }
  }
  return { documented: doc, total: all };
}

// ---- main -----------------------------------------------------------------

const wanted = process.argv.slice(2);
const selected = tins.filter((t) => statusOf(t) !== "planned" && (wanted.length === 0 || wanted.includes(slugOf(t))));
const mojoVersion = run("pixi", ["run", "--manifest-path", join(TOOL, "pixi.toml"), "mojo", "--version"]).trim();

// Every tin's source, so each one's imports of its siblings resolve. A
// sibling is taken at its own published commit, not at whatever revision the
// tin pins; for `mojo doc`, which only needs the declarations, that is close
// enough, and it means one checkout per tin.
const sources = new Map();
for (const t of tins.filter((t) => statusOf(t) !== "planned")) {
  const rev = revOf(t);
  const sha = fetchSource(t, rev);
  const root = join(CACHE, "src", slugOf(t));
  let pkg;
  try {
    pkg = packageOf(t, root);
  } catch (e) {
    console.error(String(e.message));
    continue;
  }
  dropPrograms(join(root, pkg));
  sources.set(t, { sha, root, pkg });
  console.error(`fetched ${t.name} ${t.version} @ ${sha.slice(0, 12)}`);
}
const includes = [
  ...new Set(
    [...sources.entries()].flatMap(([t, s]) => [
      dirname(join(s.root, s.pkg)),
      ...(EXTRA[slugOf(t)]?.include ?? []).map((d) => join(s.root, d)),
    ]),
  ),
].flatMap((d) => ["-I", d]);

mkdirSync(OUT, { recursive: true });
const rows = [];
for (const t of selected) {
  if (!sources.has(t)) {
    rows.push({ tin: t.name, failed: true });
    continue;
  }
  const { sha, root, pkg } = sources.get(t);
  const raw = join(CACHE, `${slugOf(t)}.raw.json`);
  try {
    run("pixi", ["run", "--manifest-path", join(TOOL, "pixi.toml"), "mojo", "doc", ...includes, "-o", raw, join(root, pkg)], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    console.error(`${t.name}: mojo doc failed\n${(e.stderr ?? "").split("\n").filter((l) => !l.includes("Crashpad")).slice(0, 12).join("\n")}`);
    rows.push({ tin: t.name, failed: true });
    continue;
  }
  const decl = JSON.parse(readFileSync(raw, "utf8")).decl;
  const name = pkg.split("/").pop();
  const api = {
    tin: t.name,
    version: statusOf(t) === "shelf" ? t.version : null,
    rev: sha,
    package: name,
    path: pkg,
    mojo: mojoVersion,
    summary: text(decl.summary),
    description: text(decl.description),
    modules: flatten(decl, name),
  };
  writeFileSync(join(OUT, `${slugOf(t)}.json`), JSON.stringify(api, null, 1) + "\n");
  const c = coverage(api);
  rows.push({ tin: t.name, ...c, modules: api.modules.length });
}

console.log("| tin | modules | documented | total | share |\n|---|---:|---:|---:|---:|");
for (const r of rows)
  console.log(r.failed ? `| ${r.tin} | failed | | | |` : `| ${r.tin} | ${r.modules} | ${r.documented} | ${r.total} | ${Math.round((100 * r.documented) / Math.max(1, r.total))}% |`);
