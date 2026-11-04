#!/usr/bin/env node
// Regenerates src/data/tincommits.json: the commit mojoshelf published each
// tin's version (the one in src/data/tins.ts) from, for the plain-pixi install
// tab (src/data/install.ts).
//
//   node scripts/tin-commits.mjs
//
// It asks the registry's API, https://mojoshelf.org/api/tins/<pkg>, so it needs
// the network but not pixi. A version in tins.ts that the registry doesn't list
// is an error: bump tins.ts only once the release is published. Cloudflare's
// build doesn't run this; the JSON is committed.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(SITE, "src", "data", "tincommits.json");
const { tins, statusOf } = await import(join(SITE, "src", "data", "tins.ts"));

const out = {};
for (const t of tins.filter((t) => statusOf(t) === "shelf")) {
  const res = await fetch(`https://mojoshelf.org/api/tins/${encodeURIComponent(t.pkg)}`);
  if (!res.ok) throw new Error(`${t.pkg}: the registry answered ${res.status}`);
  const info = await res.json();
  const v = info.versions?.find((v) => v.version === t.version);
  if (!v) throw new Error(`${t.pkg} ${t.version} is not on mojoshelf (it has ${info.versions?.[0]?.version})`);
  out[t.pkg] = {
    version: v.version,
    commit: v.commit_sha,
    ...(info.subdirectory ? { subdirectory: info.subdirectory } : {}),
  };
  console.log(`${t.pkg} ${v.version} ${v.commit_sha}${info.subdirectory ? ` (${info.subdirectory}/)` : ""}`);
}
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${Object.keys(out).length} tins to src/data/tincommits.json`);
